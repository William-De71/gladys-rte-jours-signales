// -----------------------------------------------------------------------------
// The RTE flagged days integration: every handler, registered on a Gladys
// client.
//
//   - two RTE APIs, read on the integration's own clock at the times RTE
//     publishes (French time), never on a Gladys poll (`should_poll: false`):
//       "Signal" (PP days)            00:05, 09:45, 12:15, 19:15
//       "Demand Response Signal"      00:05, 11:15
//     plus every 30 minutes while tomorrow is still unknown in the afternoon,
//     and again 15 minutes after a failure;
//   - one Gladys device per API that answered (device.js), its states
//     recomputed every 30 s (the day changes at midnight, the peak periods at
//     7, 10, 17 and 20 h) and published only when they change;
//   - scene triggers (events.js), two widgets (widgets.js), one configuration
//     button ("Test the connection").
//
// Transport: cloud (RTE APIs). index.js only creates the SDK client; the
// tests drive this module with the fake Gladys of the SDK and a fake API.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  guessLanguage,
  resolveTimezone,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import {
  createRteApi,
  CredentialsError,
  SubscriptionError,
  RateLimitError,
  ApiError,
} from './rte-api.js';
import {
  parisParts,
  addDays,
  instantOf,
  rteMidnight,
  seasonOf,
  tensionPeriodAt,
  isPpEligible,
  PP_STOCK,
} from './calendar.js';
import {
  LEVEL,
  DR_KINDS,
  parsePp,
  parseDemandResponse,
  seasonPpDays,
  ppLevel,
  drLevel,
  yearDrDays,
} from './signals.js';
import { DEVICE_TYPES, idsOf, buildDevice, buildStates, typeOfExternalId } from './device.js';
import { TRIGGERS, detectPpDays, detectDemandResponseDays, detectPeak } from './events.js';
import { WIDGETS, WIDGET_ACTIONS, buildPpWidget, buildDemandResponseWidget } from './widgets.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { t, all, isLanguage } from './i18n.js';

const ACTIONS = { TEST: 'test_connection' };
const APIS = { PP: 'pp', DR: 'demand_response' };
// Reading times, French time, minutes since midnight.
const READ_TIMES = {
  [APIS.PP]: [5, 9 * 60 + 45, 12 * 60 + 15, 19 * 60 + 15],
  [APIS.DR]: [5, 11 * 60 + 15],
};
// While tomorrow is unknown, read again this often until LATEST_RETRY.
const MISSING_RETRY_MS = 30 * 60 * 1000;
const LATEST_RETRY = 20 * 60;
// Waits after a failure.
const ERROR_RETRY_MS = 15 * 60 * 1000;
const REFUSED_RETRY_MS = 60 * 60 * 1000;
const UNSUBSCRIBED_RETRY_MS = 6 * 60 * 60 * 1000;
// At most this much random delay after a reading time (every Gladys of
// France reads at the same times).
const JITTER_MS = 2 * 60 * 1000;
// The clock: due readings, day and peak changes.
const TICK_MS = 30 * 1000;
// A refresh button or "Test the connection" reads again only past this delay.
const MIN_MANUAL_GAP_MS = 60 * 1000;
// requestWidgetRefresh: at most once every 10 s per widget.
const WIDGET_REFRESH_GAP_MS = 10 * 1000;
// publishChangedStates also re-sends an unchanged value this old.
const HEARTBEAT_MS = 30 * 60 * 1000;

const API_DEVICE = { [APIS.PP]: DEVICE_TYPES.PP, [APIS.DR]: DEVICE_TYPES.DEMAND_RESPONSE };

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {object} [options.api] - An RTE API client (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {Function} [options.random] - `() => [0, 1)` (tests).
 * @param {string|null} [options.storePath] - File of the state (null: memory).
 * @param {number} [options.tickMs] - Clock period, 0 for none (tests).
 * @param {string} [options.timezone] - IANA timezone (language guess).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    api = createRteApi(),
    now = () => Date.now(),
    random = Math.random,
    storePath = DEFAULT_PATH,
    tickMs = TICK_MS,
    timezone = resolveTimezone(),
    logger = sdkLogger,
  } = {},
) {
  const store = createStore({ path: storePath, logger });
  let config = normalizeConfig({});
  let language = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let lastDay = null;
  let timer = null;
  let running = Promise.resolve();
  const widgetRefreshedAt = new Map();
  // Per API: { status, lastSuccessAt, lastAttemptAt, nextAt, reading, yearReadOn }.
  const apis = Object.fromEntries(
    Object.values(APIS).map((key) => [
      key,
      { status: 'unknown', lastSuccessAt: 0, lastAttemptAt: 0, nextAt: 0, reading: null },
    ]),
  );
  let drYearReadOn = null;

  const textLanguage = () =>
    config.language !== AUTO_LANGUAGE ? config.language : (language ?? guessLanguage(timezone));
  const today = () => parisParts(now()).date;
  const createdIds = () => new Set((gladys.devices ?? []).map((device) => device.external_id));
  const available = () => Object.values(APIS).filter((key) => apis[key].lastSuccessAt > 0);

  // --- What the devices show -----------------------------------------------------

  /**
   * @description The figures of the PP device now.
   * @returns {object} Feature key -> value.
   */
  function ppValues() {
    const day = today();
    const { ppDays } = store.data;
    const count = seasonPpDays(ppDays, day).length;
    const todayLevel = ppLevel(day, ppDays);
    return {
      today: todayLevel,
      tomorrow: ppLevel(addDays(day, 1), ppDays),
      day_after: ppLevel(addDays(day, 2), ppDays),
      peak_now: todayLevel === LEVEL.SIGNALED && tensionPeriodAt(now()) ? LEVEL.SIGNALED : 0,
      season_count: count,
      season_remaining: Math.max(0, PP_STOCK - count),
    };
  }

  /**
   * @description The figures of the demand response device now.
   * @returns {object} Feature key -> value.
   */
  function drValues() {
    const day = today();
    const { drDays } = store.data;
    return {
      today: drLevel(day, drDays),
      tomorrow: drLevel(addDays(day, 1), drDays),
      year_count: yearDrDays(drDays, Number(day.slice(0, 4))).length,
    };
  }

  const VALUES = { [APIS.PP]: ppValues, [APIS.DR]: drValues };

  /**
   * @description The peak period under way now ("2026-11-02:morning"), or null.
   * @returns {string|null} The period.
   */
  function currentPeak() {
    const day = today();
    const period = tensionPeriodAt(now());
    return period && ppLevel(day, store.data.ppDays) === LEVEL.SIGNALED ? `${day}:${period}` : null;
  }

  // --- Publishing ---------------------------------------------------------------

  /** @description Offer the device of every API that answered. */
  async function publishDiscovery({ force = false } = {}) {
    if (!gladys.connected) return;
    const devices = available().map((key) => buildDevice(gladys, API_DEVICE[key], textLanguage()));
    const signature = JSON.stringify(devices.map((device) => [device.external_id, device.name]));
    if (!force && signature === lastDiscovery) return;
    try {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
  }

  /** @description Publish the changed states of the devices the user created. */
  async function publishStates() {
    if (!gladys.connected) return;
    const created = createdIds();
    const states = available()
      .filter((key) => created.has(idsOf(gladys, API_DEVICE[key]).device))
      .flatMap((key) => buildStates(gladys, API_DEVICE[key], VALUES[key]()));
    if (states.length === 0) return;
    try {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.error('Unable to publish the states', err);
    }
  }

  /** @description Ask Gladys to fetch the widgets again (10 s apart at least). */
  function refreshWidgets() {
    if (!gladys.connected) return;
    Object.values(WIDGETS).forEach((key) => {
      const last = widgetRefreshedAt.get(key) ?? -Infinity;
      if (now() - last < WIDGET_REFRESH_GAP_MS) return;
      widgetRefreshedAt.set(key, now());
      try {
        gladys.requestWidgetRefresh(key);
      } catch (err) {
        logger.warn(`Unable to refresh the widget ${key}: ${err.message}`);
      }
    });
  }

  /**
   * @description The state of both APIs, for a user.
   * @param {string} lang - The language.
   * @returns {string} "PP days: Connected · Demand response days: API not subscribed".
   */
  function summary(lang) {
    return t('statusSummary', lang, {
      pp: t(`api_${apis[APIS.PP].status}`, lang),
      dr: t(`api_${apis[APIS.DR].status}`, lang),
    });
  }

  /** @description Show the state of the connection in the Configuration screen. */
  async function reportStatus() {
    const statuses = Object.values(APIS).map((key) => apis[key].status);
    if (statuses.every((status) => status === 'unknown')) return;
    const connected = statuses.includes('ok');
    let message;
    if (statuses.every((status) => status === 'unconfigured')) {
      message = all('api_unconfigured_hint');
    } else if (statuses.every((status) => status === 'refused')) {
      message = all('api_refused_hint');
    } else {
      const unsubscribed = statuses.includes('unsubscribed');
      message = all((lang) =>
        [`${summary(lang)}.`, unsubscribed ? t('statusUnsubscribed', lang) : ''].join(' ').trim(),
      );
    }
    const signature = JSON.stringify([connected, message]);
    if (!gladys.connected || signature === lastStatus) return;
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the status', err);
    }
  }

  /**
   * @description Fire a scene event; a refusal is logged, never thrown.
   * @param {string} key - The trigger.
   * @param {object} data - Its data.
   */
  async function fire(key, data) {
    if (!gladys.connected) return;
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Readings -----------------------------------------------------------------

  /**
   * @description The next reading time of an API after now.
   * @param {string} key - The API.
   * @returns {number} The instant, in ms.
   */
  function nextScheduled(key) {
    const day = today();
    const candidates = [day, addDays(day, 1)].flatMap((date) =>
      READ_TIMES[key].map((minutes) => instantOf(date, minutes)),
    );
    const next = candidates.find((at) => at > now()) ?? now() + 24 * 60 * 60 * 1000;
    return next + Math.floor(random() * JITTER_MS);
  }

  /**
   * @description When to read again an API that answered: the next
   * reading time, or sooner while tomorrow is still unknown.
   * @param {string} key - The API.
   * @returns {number} The instant, in ms.
   */
  function nextAfterSuccess(key) {
    const scheduled = nextScheduled(key);
    const { date, minutes } = parisParts(now());
    const tomorrow = addDays(date, 1);
    const firstPublication = READ_TIMES[key][1];
    const missing =
      key === APIS.PP
        ? !store.data.ppDays[tomorrow] && isPpEligible(tomorrow)
        : !store.data.drDays[tomorrow];
    if (missing && minutes >= firstPublication && minutes < LATEST_RETRY) {
      return Math.min(scheduled, now() + MISSING_RETRY_MS);
    }
    return scheduled;
  }

  /**
   * @description Record an API failure.
   * @param {string} key - The API.
   * @param {Error} err - The error.
   */
  function handleError(key, err) {
    const entry = apis[key];
    if (err instanceof CredentialsError) {
      entry.status = err.reason === 'MISSING' ? 'unconfigured' : 'refused';
      entry.nextAt = now() + REFUSED_RETRY_MS;
      logger.warn(`RTE refused the credentials (${err.reason})`);
    } else if (err instanceof SubscriptionError) {
      entry.status = 'unsubscribed';
      entry.nextAt = now() + UNSUBSCRIBED_RETRY_MS;
      logger.warn(err.message);
    } else if (err instanceof RateLimitError) {
      entry.status = 'rate_limited';
      entry.nextAt = now() + Math.max(err.retryAfterMs, ERROR_RETRY_MS);
      logger.warn('RTE limits the requests');
    } else {
      entry.status = 'error';
      entry.nextAt = now() + ERROR_RETRY_MS;
      logger.warn(
        `RTE reading failed (${key}): ${err instanceof ApiError ? `HTTP ${err.status} ${err.code}` : err.message}`,
      );
    }
  }

  /**
   * @description Replace the stored days of a period by a fresh answer: a day
   * RTE no longer lists in that period was taken back.
   * @param {object} stored - Day -> signal.
   * @param {Map} fresh - Day -> signal.
   * @param {string} from - First day of the period.
   * @param {string} to - Day after the last one.
   */
  function merge(stored, fresh, from, to) {
    for (const day of Object.keys(stored)) {
      if (day >= from && day < to && !fresh.has(day)) delete stored[day];
    }
    for (const [day, signal] of fresh) stored[day] = signal;
  }

  /** @description Read the PP days of the season up to the day after tomorrow. */
  async function readPp() {
    const day = today();
    const season = seasonOf(day);
    const from = season.active ? season.start : day;
    const to = addDays(day, 4);
    const answer = await api.getPpSignals(rteMidnight(from), rteMidnight(to));
    merge(store.data.ppDays, parsePp(answer), from, to);
    const count = seasonPpDays(store.data.ppDays, day).length;
    const result = detectPpDays(store.data.announced.pp, store.data.ppDays, day, {
      count,
      remaining: Math.max(0, PP_STOCK - count),
    });
    store.data.announced.pp = result.announced;
    return result.events;
  }

  /** @description Read the demand response days: today and tomorrow, and the year once a day. */
  async function readDemandResponse() {
    const day = today();
    const year = Number(day.slice(0, 4));
    const current = parseDemandResponse(await api.getDemandResponseSignals());
    const flaggedUnknown = [...current].some(
      ([date, signal]) => signal.code > 0 && store.data.drDays[date]?.code !== signal.code,
    );
    if (drYearReadOn !== day || flaggedUnknown) {
      const from = `${year}-01-01`;
      const to = `${year + 1}-01-01`;
      const whole = await api.getDemandResponseSignals({
        start: rteMidnight(from),
        end: rteMidnight(to),
      });
      merge(store.data.drDays, parseDemandResponse(whole), from, to);
      drYearReadOn = day;
    }
    for (const [date, signal] of current) store.data.drDays[date] = signal;
    // Keep two years of history.
    const limit = `${year - 1}-01-01`;
    for (const date of Object.keys(store.data.drDays)) {
      if (date < limit) delete store.data.drDays[date];
    }
    const result = detectDemandResponseDays(
      store.data.announced.dr,
      store.data.drDays,
      day,
      yearDrDays(store.data.drDays, year).length,
    );
    store.data.announced.dr = result.announced;
    return result.events;
  }

  /** @description Forget the PP days of the seasons before the previous one. */
  function prunePp() {
    const limit = addDays(seasonOf(today()).start, -366);
    for (const date of Object.keys(store.data.ppDays)) {
      if (date < limit) delete store.data.ppDays[date];
    }
  }

  const READERS = { [APIS.PP]: readPp, [APIS.DR]: readDemandResponse };

  /**
   * @description Read one API (a single reading at a time per API).
   * @param {string} key - The API.
   * @param {string} reason - timer, manual, connected, config.
   * @returns {Promise<boolean>} The reading worked.
   */
  function read(key, reason = 'timer') {
    const entry = apis[key];
    if (entry.reading) return entry.reading;
    entry.reading = (async () => {
      entry.lastAttemptAt = now();
      if (!api.hasCredentials()) {
        entry.status = 'unconfigured';
        entry.nextAt = now() + REFUSED_RETRY_MS;
        return false;
      }
      try {
        const events = await READERS[key]();
        if (key === APIS.PP) prunePp();
        store.save();
        entry.status = 'ok';
        entry.lastSuccessAt = now();
        entry.nextAt = nextAfterSuccess(key);
        logger.debug?.(`Read the ${key} signals (${reason})`);
        await publishDiscovery();
        await publishStates();
        for (const event of events) await fire(event.key, event.data);
        return true;
      } catch (err) {
        handleError(key, err);
        return false;
      }
    })().finally(async () => {
      entry.reading = null;
      await reportStatus();
      refreshWidgets();
    });
    return entry.reading;
  }

  /** @description Read both APIs. */
  async function readAll(reason) {
    const results = [];
    for (const key of Object.values(APIS)) results.push(await read(key, reason));
    return results;
  }

  /** @description The clock: due readings, then the day and the peak periods. */
  async function tick() {
    if (!gladys.connected) return;
    for (const key of Object.values(APIS)) {
      if (now() >= apis[key].nextAt) await read(key, 'timer');
    }
    const day = today();
    const peak = currentPeak();
    const events = detectPeak(store.data.peak, peak);
    if (events.length > 0 || day !== lastDay) {
      store.data.peak = peak;
      store.save();
      lastDay = day;
      await publishStates();
      for (const event of events) await fire(event.key, event.data);
      refreshWidgets();
    }
  }

  /**
   * @description A manual reading of both APIs, unless one just happened.
   * @returns {Promise<boolean>} At least one API answered.
   */
  async function manualRead() {
    const recent = Object.values(APIS).every(
      (key) => apis[key].status === 'ok' && now() - apis[key].lastAttemptAt < MIN_MANUAL_GAP_MS,
    );
    if (recent) return true;
    const results = await readAll('manual');
    return results.some(Boolean);
  }

  // --- Configuration button ----------------------------------------------------------

  gladys.onAction(ACTIONS.TEST, async () => {
    if (!api.hasCredentials()) return all('api_unconfigured_hint');
    await manualRead();
    return all((lang) => {
      const parts = [`${summary(lang)}.`];
      if (apis[APIS.PP].status === 'ok') {
        const values = ppValues();
        const text = (level) => t({ 3: 'ppSignaled', 1: 'ppPending', 0: 'ppNormal' }[level], lang);
        parts.push(
          t('testDetail', lang, { today: text(values.today), tomorrow: text(values.tomorrow) }),
        );
      }
      for (const key of Object.values(APIS)) {
        const status = apis[key].status;
        if (status !== 'ok' && status !== 'unknown') {
          parts.push(
            t(
              status === 'unsubscribed' ? `api_unsubscribed_hint_${key}` : `api_${status}_hint`,
              lang,
            ),
          );
        }
      }
      return [...new Set(parts)].join(' ').slice(0, 2000);
    });
  });

  // --- Widgets ------------------------------------------------------------------------

  /**
   * @description Remember the language of the last widget request (the
   * device names follow it when the configuration says "automatic").
   * @param {string} lang - The language of the request.
   */
  function rememberLanguage(lang) {
    if (!isLanguage(lang) || lang === language) return;
    const before = textLanguage();
    language = lang;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: lang })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
    if (textLanguage() !== before) publishDiscovery();
  }

  gladys.onWidgetGet(WIDGETS.PP_DAYS, async ({ language: lang } = {}) => {
    rememberLanguage(lang);
    const day = today();
    const values = ppValues();
    const season = seasonOf(day);
    return buildPpWidget({
      status: apis[APIS.PP].status,
      lastSuccessAt: apis[APIS.PP].lastSuccessAt,
      today: day,
      minutes: parisParts(now()).minutes,
      levels: { today: values.today, tomorrow: values.tomorrow, day_after: values.day_after },
      season: {
        label: season.label,
        active: season.active,
        days: seasonPpDays(store.data.ppDays, day),
      },
      language: isLanguage(lang) ? lang : textLanguage(),
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.DEMAND_RESPONSE, async ({ language: lang } = {}) => {
    rememberLanguage(lang);
    const day = today();
    const tomorrow = addDays(day, 1);
    const year = Number(day.slice(0, 4));
    const values = drValues();
    const { drDays } = store.data;
    const kindOf = (date) => DR_KINDS[drDays[date]?.code] ?? null;
    return buildDemandResponseWidget({
      status: apis[APIS.DR].status,
      lastSuccessAt: apis[APIS.DR].lastSuccessAt,
      today: day,
      levels: { today: values.today, tomorrow: values.tomorrow },
      kinds: { today: kindOf(day), tomorrow: kindOf(tomorrow) },
      year: {
        year,
        days: yearDrDays(drDays, year).map((date) => ({ day: date, kind: kindOf(date) })),
      },
      language: isLanguage(lang) ? lang : textLanguage(),
      now: now(),
    });
  });

  /**
   * @description The "Refresh" button of both widgets.
   * @param {string} actionKey - The button.
   * @returns {Promise<object>} The toast.
   */
  async function widgetAction(actionKey) {
    if (actionKey !== WIDGET_ACTIONS.REFRESH) throw new Error(`Unknown button ${actionKey}`);
    const ok = await manualRead();
    if (!ok) return all((lang) => t('toastFailed', lang, { error: summary(lang) }));
    return all('toastRefreshed');
  }
  gladys.onWidgetAction(WIDGETS.PP_DAYS, widgetAction);
  gladys.onWidgetAction(WIDGETS.DEMAND_RESPONSE, widgetAction);

  // --- Devices and configuration --------------------------------------------------

  gladys.onScanRequest(async () => {
    if (available().length === 0) await readAll('scan');
    await publishDiscovery({ force: true });
  });

  gladys.onDeviceCreated(async (device) => {
    if (typeOfExternalId(gladys, device.external_id)) await publishStates();
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    if (typeOfExternalId(gladys, device.external_id)) await publishStates();
  });

  gladys.onConfigUpdated(async (raw) => {
    const previous = { ...config, language: textLanguage() };
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.clientId, config.clientSecret);
    if (textLanguage() !== previous.language) await publishDiscovery({ force: true });
    if (config.clientId !== previous.clientId || config.clientSecret !== previous.clientSecret) {
      lastStatus = null;
      for (const key of Object.values(APIS)) {
        apis[key].status = 'unknown';
        apis[key].nextAt = 0;
      }
      await tick();
    } else {
      refreshWidgets();
    }
  });

  gladys.on('connected', async () => {
    const raw = gladys.config ?? {};
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.clientId, config.clientSecret);
    lastStatus = null;
    lastDiscovery = null;
    lastDay = null;
    for (const key of Object.values(APIS)) apis[key].nextAt = 0;
    running = tick();
    await running;
    if (tickMs > 0 && timer === null) {
      timer = setInterval(() => {
        running = tick().catch((err) => logger.error('Tick failed', err));
      }, tickMs);
      timer.unref?.();
    }
  });

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stop();
    await running;
    store.save();
  });

  return {
    read,
    tick,
    stop,
    store,
    apis,
    ppValues,
    drValues,
  };
}

export {
  ACTIONS,
  APIS,
  READ_TIMES,
  TICK_MS,
  MIN_MANUAL_GAP_MS,
  ERROR_RETRY_MS,
  MISSING_RETRY_MS,
  TRIGGERS,
  createApp,
};
