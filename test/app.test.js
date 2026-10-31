// The whole integration against the fake Gladys of the SDK and a fake RTE
// client: readings at the RTE times, discovery, states, scene triggers,
// peak periods, widgets, errors, persistence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, MISSING_RETRY_MS, ERROR_RETRY_MS } from '../src/app.js';
import {
  CredentialsError,
  SubscriptionError,
  RateLimitError,
  NetworkError,
} from '../src/rte-api.js';
import { fakeApi } from './helpers/fake-api.js';

const CONFIG = { client_id: 'id', client_secret: 'secret' };
const PP = 'ext:test-integration:pp:france';
const DR = 'ext:test-integration:demand_response:france';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// Monday 2 November 2026, 8:00 in Paris (winter time, UTC+1).
const MONDAY_8AM = Date.parse('2026-11-02T07:00:00Z');

/**
 * @description A connected integration on a fake clock.
 * @param {object} [options] - Options.
 * @returns {Promise<object>} The handles.
 */
async function start({
  config = CONFIG,
  api = fakeApi({
    pp: { '2026-11-02': true, '2026-11-03': false },
    dr: { '2026-11-02': 2 },
  }),
  storePath = null,
  created = true,
  devices = [],
  at = MONDAY_8AM,
} = {}) {
  const clock = { now: at };
  const gladys = createFakeGladys({ config: { ...config }, devices });
  const app = createApp(gladys, {
    api,
    now: () => clock.now,
    random: () => 0,
    storePath,
    tickMs: 0,
    timezone: 'Europe/Paris',
  });
  await gladys.connect();
  if (created && devices.length === 0) {
    for (const device of gladys.fake.discoveredDevices) await gladys.fake.deviceCreated(device);
  }
  const advance = async (ms) => {
    clock.now += ms;
    await app.tick();
  };
  const until = async (iso) => advance(Date.parse(iso) - clock.now);
  const state = (device, key) => gladys.fake.lastState(`${device}:${key}`);
  const events = (key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
  return { gladys, app, api, clock, advance, until, state, events };
}

test('without credentials: nothing is requested, the configuration says what to do', async () => {
  const { gladys, api } = await start({ config: {} });
  assert.deepEqual(api.calls, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /ID client/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('the first reading: the season of PP days, today, tomorrow and the year of flagged days', async () => {
  const { gladys, api } = await start({ created: false });
  assert.deepEqual(api.calls, [
    ['pp', '2026-11-01T00:00:00+01:00', '2026-11-06T00:00:00+01:00'],
    ['demand_response', null],
    ['demand_response', '2026-01-01T00:00:00+01:00'],
  ]);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [PP, 'Jours PP RTE'],
      [DR, 'Jours signalés effacement RTE'],
    ],
  );
  assert.equal(gladys.fake.states.length, 0, 'no state before the user adds a device');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    'PP days: Connected · Demand response days: Connected.',
  );
});

test('the devices show the levels of the days, the peak period and the counters', async () => {
  const { state } = await start();
  assert.equal(state(PP, 'today'), 3, 'a PP day');
  assert.equal(state(PP, 'tomorrow'), 0, 'RTE said no');
  assert.equal(state(PP, 'day_after'), 1, 'a working day not announced yet');
  assert.equal(state(PP, 'peak_now'), 3, '8:00 is inside 7-10 h');
  assert.equal(state(PP, 'season_count'), 1);
  assert.equal(state(PP, 'season_remaining'), 21);
  assert.equal(state(DR, 'today'), 3, 'flagged (implicit)');
  assert.equal(state(DR, 'tomorrow'), 1, 'not published yet');
  assert.equal(state(DR, 'year_count'), 1);
});

test('a scene event per announced day, never twice, even after a restart', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rte-')), 'state.json');
  const first = await start({ storePath: path });
  assert.deepEqual(first.events('pp_day_announced'), [
    {
      key: 'pp_day_announced',
      data: {
        date: '2026-11-02',
        when: 'today',
        days_ahead: 0,
        season_count: 1,
        season_remaining: 21,
      },
    },
  ]);
  assert.deepEqual(first.events('demand_response_day_announced'), [
    {
      key: 'demand_response_day_announced',
      data: {
        date: '2026-11-02',
        when: 'today',
        days_ahead: 0,
        kind: 'implicit',
        explicit: false,
        implicit: true,
        year_count: 1,
      },
    },
  ]);
  assert.equal((statSync(path).mode & 0o777).toString(8), '600');
  assert.doesNotMatch(readFileSync(path, 'utf8'), /secret/);

  // RTE announces Wednesday at 12:15 (D-2).
  first.api.pp['2026-11-04'] = true;
  await first.until('2026-11-02T11:15:00Z');
  const announced = first.events('pp_day_announced');
  assert.equal(announced.length, 2);
  assert.deepEqual(announced[1].data, {
    date: '2026-11-04',
    when: 'day_after',
    days_ahead: 2,
    season_count: 2,
    season_remaining: 20,
  });
  assert.equal(first.state(PP, 'day_after'), 3);

  const second = await start({ storePath: path, api: first.api, at: first.clock.now });
  assert.deepEqual(second.gladys.fake.sceneEvents, [], 'nothing fires again');
});

test('the peak periods start and end at 7, 10, 17 and 20 h of a PP day only', async () => {
  const { advance, until, state, events } = await start();
  await until('2026-11-02T09:00:00Z');
  assert.equal(state(PP, 'peak_now'), 0);
  assert.deepEqual(events('pp_peak_ended').at(-1).data, {
    date: '2026-11-02',
    period: 'morning',
    start: '07:00',
    end: '10:00',
  });
  await until('2026-11-02T16:00:00Z');
  assert.equal(state(PP, 'peak_now'), 3);
  assert.equal(events('pp_peak_started').at(-1).data.period, 'evening');
  await until('2026-11-02T19:00:00Z');
  assert.equal(events('pp_peak_ended').length, 2);
  // Tuesday is no PP day: nothing at 7 h.
  await until('2026-11-03T06:30:00Z');
  await advance(HOUR);
  assert.equal(state(PP, 'peak_now'), 0);
  // Started at 8:00 (first reading), then at 17:00.
  assert.equal(events('pp_peak_started').length, 2);
});

test('the day changes at midnight, French time: tomorrow becomes today', async () => {
  const { until, state, api } = await start();
  api.dr['2026-11-03'] = 0;
  await until('2026-11-02T23:00:00Z');
  assert.equal(state(PP, 'today'), 0);
  assert.equal(state(PP, 'tomorrow'), 1, 'Wednesday, not announced yet');
  assert.equal(state(DR, 'today'), 0);
});

test('readings at the RTE times, and every 30 minutes while tomorrow is unknown', async () => {
  const { api, until } = await start({
    api: fakeApi({ pp: { '2026-11-02': true }, dr: { '2026-11-02': 0 } }),
  });
  const ppCalls = () => api.calls.filter(([key]) => key === 'pp').length;
  await until('2026-11-02T08:44:00Z');
  assert.equal(ppCalls(), 1, 'nothing before 9:45');
  await until('2026-11-02T08:45:00Z');
  assert.equal(ppCalls(), 2, '9:45');
  await until('2026-11-02T08:45:00Z');
  await until(new Date(Date.parse('2026-11-02T08:45:00Z') + MISSING_RETRY_MS).toISOString());
  assert.equal(ppCalls(), 3, 'tomorrow still unknown: again 30 minutes later');
  api.pp['2026-11-03'] = false;
  await until('2026-11-02T09:45:00Z');
  assert.equal(ppCalls(), 4);
  await until('2026-11-02T11:00:00Z');
  assert.equal(ppCalls(), 4, 'known: next at 12:15');
  await until('2026-11-02T11:15:00Z');
  assert.equal(ppCalls(), 5);
});

test('an application subscribed to one API only gets one device and a hint', async () => {
  const api = fakeApi({ pp: { '2026-11-02': false } });
  api.errors.demand_response = new SubscriptionError('demand_response');
  const { gladys } = await start({ api, created: false });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [PP],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Jours PP : Connectée · Jours signalés effacement : API non souscrite. Abonnez votre application à l’API manquante sur data.rte-france.com.',
  );
});

test('refused credentials: not connected, tried again in an hour or when they change', async () => {
  const api = fakeApi();
  api.errors.pp = new CredentialsError('INVALID_CLIENT', 401);
  api.errors.demand_response = new CredentialsError('INVALID_CLIENT', 401);
  const { gladys, advance } = await start({ api });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the client id/);
  const calls = api.calls.length;
  await advance(30 * MINUTE);
  assert.equal(api.calls.length, calls);
  delete api.errors.pp;
  delete api.errors.demand_response;
  await gladys.fake.configUpdated({ client_id: 'id2', client_secret: 'secret2' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a network failure or a 429: tried again later, the last values stay', async () => {
  const { api, advance, state, gladys } = await start();
  api.errors.pp = new NetworkError('timeout');
  await advance(2 * MINUTE);
  await gladys.fake.action('test_connection');
  assert.equal(state(PP, 'today'), 3);
  const calls = api.calls.length;
  await advance(ERROR_RETRY_MS - MINUTE);
  assert.equal(api.calls.length, calls);
  api.errors.pp = new RateLimitError(HOUR);
  await advance(2 * MINUTE);
  assert.equal(api.calls.length, calls + 1);
  await advance(30 * MINUTE);
  assert.equal(api.calls.length, calls + 1, 'Retry-After respected');
  const widget = await gladys.fake.widgetGet('pp_days', { language: 'en' });
  assert.match(JSON.stringify(widget.data), /Too many requests/);
});

test('the widgets, in every language, pass the checks of the core', async () => {
  const { gladys } = await start();
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of ['pp_days', 'demand_response']) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      const result = validateWidgetContent(ack.data);
      assert.deepEqual(result.removed ?? [], [], `${key} ${language}`);
    }
  }
  const pp = await gladys.fake.widgetGet('pp_days', { language: 'fr' });
  const text = JSON.stringify(pp.data);
  assert.match(text, /Jour PP/);
  assert.match(text, /En cours jusqu’à 10:00/);
  assert.match(text, /1\/22/);
  assert.match(text, /lun\. 2 novembre/);
});

test('the Refresh button reads both APIs, at most once a minute', async () => {
  const { gladys, api } = await start();
  const calls = api.calls.length;
  const ack = await gladys.fake.widgetAction('pp_days', 'refresh');
  assert.equal(ack.data.message.fr, 'Signaux RTE relus.');
  assert.equal(api.calls.length, calls, 'read less than a minute ago');
});

test('"Test the connection" sums the state of both APIs up', async () => {
  const { gladys } = await start();
  const ack = await gladys.fake.action('test_connection');
  assert.match(
    ack.data.message.fr,
    /^Jours PP : Connectée · Jours signalés effacement : Connectée\. /,
  );
  assert.match(ack.data.message.fr, /aujourd’hui Jour PP, demain Jour normal/);
});

test('off season: no PP day possible, the reading starts today', async () => {
  const { api, state } = await start({
    api: fakeApi(),
    at: Date.parse('2026-06-10T08:00:00Z'),
  });
  assert.deepEqual(api.calls[0], ['pp', '2026-06-10T00:00:00+02:00', '2026-06-14T00:00:00+02:00']);
  assert.equal(state(PP, 'today'), 0);
  assert.equal(state(PP, 'tomorrow'), 0);
  assert.equal(state(PP, 'season_remaining'), 22);
});
