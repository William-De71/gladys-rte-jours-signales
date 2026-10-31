// -----------------------------------------------------------------------------
// The RTE answers, parsed into day maps, and the level of a day.
//
// PP ("Signal" 2.0):
//   { signals: [{ start_date, end_date, type: "PP",
//                 values: [{ start_date, end_date, value: true|false, updated_date }] }] }
// Demand response ("Demand Response Signal" 2.0):
//   { signals: [{ start_date, end_date,
//                 signaled_dates: [{ start_date, end_date, updated_date, aoe_signals }] }] }
//   aoe_signals: 0 not flagged, 1 explicit, 2 implicit, 3 explicit and implicit.
//
// RTE writes its dates in French time ("2026-11-02T00:00:00+01:00"), so the
// first ten characters are the French calendar day.
//
// The level of a day is what the devices publish (risk/integer, read by the
// Gladys badge as 0 "no risk", 1 "low", 3 "high"):
//   0 NORMAL    an ordinary day: RTE said no, or the day cannot be flagged
//   1 PENDING   not published yet, and the day may still be flagged
//   3 SIGNALED  a PP day / a flagged demand response day
// -----------------------------------------------------------------------------

import { isPpEligible, seasonOf, PP_STOCK } from './calendar.js';

const LEVEL = { NORMAL: 0, PENDING: 1, SIGNALED: 3 };
const DR_KINDS = { 1: 'explicit', 2: 'implicit', 3: 'explicit_implicit' };

/**
 * @description The French day of an RTE date.
 * @param {unknown} value - "2026-11-02T00:00:00+01:00".
 * @returns {string|null} "2026-11-02", or null when it is not a date.
 */
function dayOf(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : null;
}

/**
 * @description The instant of an RTE date.
 * @param {unknown} value - An RTE date.
 * @returns {number|null} Ms, or null.
 */
function instantOf(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @description The PP days of a "Signal" answer.
 * @param {object} body - The answer.
 * @returns {Map<string, {pp: boolean, updated: number|null}>} Day -> signal.
 */
function parsePp(body) {
  const days = new Map();
  const signals = Array.isArray(body?.signals) ? body.signals : [];
  for (const signal of signals) {
    if (signal?.type !== undefined && signal.type !== 'PP') continue;
    for (const value of Array.isArray(signal?.values) ? signal.values : []) {
      const day = dayOf(value?.start_date);
      if (!day || typeof value.value !== 'boolean') continue;
      days.set(day, { pp: value.value, updated: instantOf(value.updated_date) });
    }
  }
  return days;
}

/**
 * @description The days of a "Demand Response Signal" answer.
 * @param {object} body - The answer.
 * @returns {Map<string, {code: number, updated: number|null}>} Day -> signal.
 */
function parseDemandResponse(body) {
  const days = new Map();
  const signals = Array.isArray(body?.signals) ? body.signals : [];
  for (const signal of signals) {
    for (const entry of Array.isArray(signal?.signaled_dates) ? signal.signaled_dates : []) {
      const day = dayOf(entry?.start_date);
      const code = Number(entry?.aoe_signals);
      if (!day || !Number.isInteger(code) || code < 0 || code > 3) continue;
      days.set(day, { code, updated: instantOf(entry.updated_date) });
    }
  }
  return days;
}

/**
 * @description The PP days of a season, oldest first.
 * @param {object} ppDays - Day -> `{ pp }` (plain object, as stored).
 * @param {string} date - A day of the season (or before it).
 * @returns {string[]} The PP days.
 */
function seasonPpDays(ppDays, date) {
  const { start, end } = seasonOf(date);
  return Object.entries(ppDays)
    .filter(([day, signal]) => signal?.pp === true && day >= start && day < end)
    .map(([day]) => day)
    .sort();
}

/**
 * @description The level of a day for the PP device.
 * @param {string} date - The day.
 * @param {object} ppDays - Day -> `{ pp }`.
 * @returns {number} A LEVEL.
 */
function ppLevel(date, ppDays) {
  const known = ppDays[date];
  if (known) return known.pp ? LEVEL.SIGNALED : LEVEL.NORMAL;
  if (!isPpEligible(date)) return LEVEL.NORMAL;
  return seasonPpDays(ppDays, date).length < PP_STOCK ? LEVEL.PENDING : LEVEL.NORMAL;
}

/**
 * @description The level of a day for the demand response device.
 * @param {string} date - The day.
 * @param {object} drDays - Day -> `{ code }`.
 * @returns {number} A LEVEL.
 */
function drLevel(date, drDays) {
  const known = drDays[date];
  if (!known) return LEVEL.PENDING;
  return known.code > 0 ? LEVEL.SIGNALED : LEVEL.NORMAL;
}

/**
 * @description The flagged demand response days of a calendar year, oldest first.
 * @param {object} drDays - Day -> `{ code }`.
 * @param {number} year - The year.
 * @returns {string[]} The days.
 */
function yearDrDays(drDays, year) {
  const prefix = `${year}-`;
  return Object.entries(drDays)
    .filter(([day, signal]) => day.startsWith(prefix) && signal?.code > 0)
    .map(([day]) => day)
    .sort();
}

export {
  LEVEL,
  DR_KINDS,
  dayOf,
  parsePp,
  parseDemandResponse,
  seasonPpDays,
  ppLevel,
  drLevel,
  yearDrDays,
};
