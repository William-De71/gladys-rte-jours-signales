// -----------------------------------------------------------------------------
// Dashboard widgets, built from the last readings (no request to RTE).
//
//   - pp_days:          today, tomorrow and the day after (PP day, normal
//                       day, not announced yet), the peak periods of a PP
//                       day, the PP days of the season so far and left out
//                       of 22, the list of the PP days of the season;
//   - demand_response:  today and tomorrow (flagged, explicit / implicit),
//                       the flagged days of the year and their list.
//
// Both carry a "Refresh" button. The content stays within the budget of the
// core (8 components, 1 focal, 2 texts, 1 status, 4 buttons) and every text
// exists in the four languages (test/widgets.test.js runs
// validateWidgetContent on them).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LEVEL } from './signals.js';
import { TENSION_PERIODS, PP_STOCK } from './calendar.js';
import { clock } from './events.js';
import { t, ago, formatDay } from './i18n.js';

const WIDGETS = { PP_DAYS: 'pp_days', DEMAND_RESPONSE: 'demand_response' };
const WIDGET_ACTIONS = { REFRESH: 'refresh' };
// Rows of the list of days.
const MAX_ITEMS = 4;
const TTL_SECONDS = 300;

const LEVEL_COLOR = {
  [LEVEL.SIGNALED]: WIDGET_COLORS.DANGER,
  [LEVEL.PENDING]: WIDGET_COLORS.WARNING,
  [LEVEL.NORMAL]: WIDGET_COLORS.SUCCESS,
};

/**
 * @description The text of a PP level.
 * @param {number} level - A LEVEL.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ppLevelText(level, language) {
  if (level === LEVEL.SIGNALED) return t('ppSignaled', language);
  if (level === LEVEL.PENDING) return t('ppPending', language);
  return t('ppNormal', language);
}

/**
 * @description The text of a demand response day.
 * @param {number} level - A LEVEL.
 * @param {string|null} kind - explicit, implicit, explicit_implicit.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function drLevelText(level, kind, language) {
  if (level === LEVEL.SIGNALED) {
    return t('drSignaled', language, { kind: t(`kind_${kind}`, language) });
  }
  if (level === LEVEL.PENDING) return t('drPending', language);
  return t('drNormal', language);
}

/**
 * @description The peak period row of a PP day.
 * @param {number} minutes - French time now, minutes since midnight.
 * @param {string} language - The language.
 * @returns {{label: string, value: string, color: string}} The row.
 */
function peakRow(minutes, language) {
  const current = TENSION_PERIODS.find((period) => minutes >= period.start && minutes < period.end);
  const next = TENSION_PERIODS.find((period) => minutes < period.start);
  let value;
  let color = WIDGET_COLORS.NEUTRAL;
  if (current) {
    value = t('peakNow', language, { end: clock(current.end) });
    color = WIDGET_COLORS.DANGER;
  } else if (next) {
    value = t('peakNext', language, { start: clock(next.start) });
    color = WIDGET_COLORS.WARNING;
  } else {
    value = t('peakOver', language);
  }
  return { label: t('rowPeak', language), value, color };
}

/**
 * @description The body text shown instead of the data when an API failed
 * before any reading.
 * @param {string} api - pp or demand_response.
 * @param {string} status - The state of the API.
 * @param {string} language - The language.
 * @returns {object} The component.
 */
function hintText(api, status, language) {
  const key = status === 'unsubscribed' ? `api_unsubscribed_hint_${api}` : `api_${status}_hint`;
  return { type: 'text', variant: 'body', text: t(key, language) };
}

const refreshButton = (language) => ({
  type: 'button',
  label: t('buttonRefresh', language),
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: WIDGET_ACTIONS.REFRESH },
});

/**
 * @description A badge for a listed day: today or coming.
 * @param {string} day - The day.
 * @param {string} today - Today.
 * @param {string} language - The language.
 * @returns {object|undefined} The badge.
 */
function dayBadge(day, today, language) {
  if (day === today) return { text: t('badgeToday', language), color: WIDGET_COLORS.DANGER };
  if (day > today) return { text: t('badgeUpcoming', language), color: WIDGET_COLORS.WARNING };
  return undefined;
}

/**
 * @description The PP days widget.
 * @param {object} view - What the app knows.
 * @param {string} view.status - State of the Signal API (ok, unknown, unconfigured…).
 * @param {number} view.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {string} view.today - Today, French day.
 * @param {number} view.minutes - French time now, minutes since midnight.
 * @param {{today: number, tomorrow: number, day_after: number}} view.levels - The levels.
 * @param {{label: string, active: boolean, days: string[]}} view.season - The season.
 * @param {string} view.language - The language.
 * @param {number} view.now - Now (ms).
 * @returns {object} The content.
 */
function buildPpWidget({ status, lastSuccessAt, today, minutes, levels, season, language, now }) {
  const components = [];
  if (!lastSuccessAt) {
    components.push(hintText('pp', status === 'ok' ? 'unknown' : status, language));
    components.push(refreshButton(language));
    return { ttl_seconds: 60, components };
  }
  const rows = [
    ['rowToday', levels.today],
    ['rowTomorrow', levels.tomorrow],
    ['rowDayAfter', levels.day_after],
  ].map(([key, level]) => ({
    label: t(key, language),
    value: ppLevelText(level, language),
    color: LEVEL_COLOR[level],
  }));
  if (levels.today === LEVEL.SIGNALED) rows.splice(1, 0, peakRow(minutes, language));
  components.push({ type: 'status', items: rows });
  const count = season.days.length;
  components.push(
    {
      type: 'value',
      value: `${count}/${PP_STOCK}`,
      label: t('tileSeasonCount', language),
      icon: 'zap',
      color: count > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      value: Math.max(0, PP_STOCK - count),
      label: t('tileRemaining', language),
      icon: 'calendar',
    },
  );
  if (count > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: [...season.days]
        .reverse()
        .slice(0, MAX_ITEMS)
        .map((day) => {
          const badge = dayBadge(day, today, language);
          return { title: formatDay(day, language), ...(badge ? { badge } : {}) };
        }),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: t(season.active ? 'emptySeason' : 'offSeason', language),
    });
  }
  components.push({
    type: 'text',
    variant: 'caption',
    text:
      status === 'ok'
        ? t('captionSeason', language, {
            season: season.label,
            ago: ago(lastSuccessAt, now, language),
          })
        : `${t(`api_${status}`, language)} · ${ago(lastSuccessAt, now, language)}`,
  });
  components.push(refreshButton(language));
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The demand response widget.
 * @param {object} view - What the app knows.
 * @param {string} view.status - State of the Demand Response Signal API.
 * @param {number} view.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {string} view.today - Today, French day.
 * @param {{today: number, tomorrow: number}} view.levels - The levels.
 * @param {{today: string|null, tomorrow: string|null}} view.kinds - The kinds of the flagged days.
 * @param {{year: number, days: Array<{day: string, kind: string}>}} view.year - The flagged days of the year.
 * @param {string} view.language - The language.
 * @param {number} view.now - Now (ms).
 * @returns {object} The content.
 */
function buildDemandResponseWidget({
  status,
  lastSuccessAt,
  today,
  levels,
  kinds,
  year,
  language,
  now,
}) {
  const components = [];
  if (!lastSuccessAt) {
    components.push(hintText('demand_response', status === 'ok' ? 'unknown' : status, language));
    components.push(refreshButton(language));
    return { ttl_seconds: 60, components };
  }
  components.push({
    type: 'status',
    items: [
      ['rowToday', 'today'],
      ['rowTomorrow', 'tomorrow'],
    ].map(([key, day]) => ({
      label: t(key, language),
      value: drLevelText(levels[day], kinds[day], language),
      color: LEVEL_COLOR[levels[day]],
    })),
  });
  components.push({
    type: 'value',
    value: year.days.length,
    label: t('tileYearCount', language, { year: year.year }),
    icon: 'calendar',
  });
  if (year.days.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: [...year.days]
        .reverse()
        .slice(0, MAX_ITEMS)
        .map(({ day, kind }) => {
          const badge = dayBadge(day, today, language);
          return {
            title: formatDay(day, language),
            subtitle: t(`kind_${kind}`, language),
            ...(badge ? { badge } : {}),
          };
        }),
    });
  } else {
    components.push({ type: 'text', variant: 'body', text: t('emptyYear', language) });
  }
  components.push({
    type: 'text',
    variant: 'caption',
    text:
      status === 'ok'
        ? t('captionYear', language, { year: year.year, ago: ago(lastSuccessAt, now, language) })
        : `${t(`api_${status}`, language)} · ${ago(lastSuccessAt, now, language)}`,
  });
  components.push(refreshButton(language));
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  ppLevelText,
  drLevelText,
  peakRow,
  buildPpWidget,
  buildDemandResponseWidget,
};
