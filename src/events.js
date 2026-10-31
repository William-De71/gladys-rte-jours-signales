// -----------------------------------------------------------------------------
// Scene triggers.
//
//   pp_day_announced               RTE flagged a PP day (today, tomorrow, the
//                                  day after); once per day, even across
//                                  restarts (the announced days are kept in
//                                  /data)
//   pp_peak_started / pp_peak_ended   a peak period of a PP day begins / ends
//                                  (7-10 a.m., 5-8 p.m., French time)
//   demand_response_day_announced  RTE flagged a demand response day, or
//                                  changed its kind (explicit / implicit)
//
// A day is announced once: RTE publishing the same answer again, or the
// integration restarting, fires nothing. A day RTE takes back is forgotten
// silently. Days in the past only update the memory.
// -----------------------------------------------------------------------------

import { TENSION_PERIODS, daysBetween, addDays } from './calendar.js';
import { DR_KINDS } from './signals.js';

const TRIGGERS = {
  PP_DAY_ANNOUNCED: 'pp_day_announced',
  PP_PEAK_STARTED: 'pp_peak_started',
  PP_PEAK_ENDED: 'pp_peak_ended',
  DEMAND_RESPONSE_DAY_ANNOUNCED: 'demand_response_day_announced',
};

// Values of the `when` field and variable.
const WHEN = ['today', 'tomorrow', 'day_after', 'later'];
// How long the announced days are remembered.
const MEMORY_DAYS = 400;

/**
 * @description The `when` of a day.
 * @param {number} daysAhead - Days from today.
 * @returns {string} today, tomorrow, day_after or later.
 */
const whenOf = (daysAhead) => WHEN[Math.min(Math.max(daysAhead, 0), 3)];

/**
 * @description "HH:MM" of minutes since midnight.
 * @param {number} minutes - Minutes.
 * @returns {string} The time.
 */
const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * @description Forget the memory older than MEMORY_DAYS.
 * @param {object} memory - Day -> anything.
 * @param {string} today - Today.
 * @returns {object} The kept part.
 */
function prune(memory, today) {
  const limit = addDays(today, -MEMORY_DAYS);
  return Object.fromEntries(Object.entries(memory ?? {}).filter(([day]) => day >= limit));
}

/**
 * @description The PP days to announce.
 * @param {object} announced - Day -> true, the days already announced.
 * @param {object} ppDays - Day -> `{ pp }`, as known now.
 * @param {string} today - Today.
 * @param {{ count: number, remaining: number }} season - The season figures.
 * @returns {{ events: Array<{key: string, data: object}>, announced: object }} The events and the new memory.
 */
function detectPpDays(announced, ppDays, today, season) {
  const memory = prune(announced, today);
  const events = [];
  for (const [day, signal] of Object.entries(ppDays).sort(([a], [b]) => a.localeCompare(b))) {
    if (!signal?.pp) {
      delete memory[day];
      continue;
    }
    if (memory[day]) continue;
    memory[day] = true;
    const daysAhead = daysBetween(today, day);
    if (daysAhead < 0) continue;
    events.push({
      key: TRIGGERS.PP_DAY_ANNOUNCED,
      data: {
        date: day,
        when: whenOf(daysAhead),
        days_ahead: daysAhead,
        season_count: season.count,
        season_remaining: season.remaining,
      },
    });
  }
  return { events, announced: memory };
}

/**
 * @description The demand response days to announce.
 * @param {object} announced - Day -> code already announced.
 * @param {object} drDays - Day -> `{ code }`, as known now.
 * @param {string} today - Today.
 * @param {number} yearCount - Flagged days of this year.
 * @returns {{ events: Array<{key: string, data: object}>, announced: object }} The events and the new memory.
 */
function detectDemandResponseDays(announced, drDays, today, yearCount) {
  const memory = prune(announced, today);
  const events = [];
  for (const [day, signal] of Object.entries(drDays).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(signal?.code > 0)) {
      delete memory[day];
      continue;
    }
    if (memory[day] === signal.code) continue;
    memory[day] = signal.code;
    const daysAhead = daysBetween(today, day);
    if (daysAhead < 0) continue;
    events.push({
      key: TRIGGERS.DEMAND_RESPONSE_DAY_ANNOUNCED,
      data: {
        date: day,
        when: whenOf(daysAhead),
        days_ahead: daysAhead,
        kind: DR_KINDS[signal.code],
        explicit: signal.code === 1 || signal.code === 3,
        implicit: signal.code === 2 || signal.code === 3,
        year_count: yearCount,
      },
    });
  }
  return { events, announced: memory };
}

/**
 * @description The peak period events between two clock ticks.
 * @param {string|null} previous - The period under way at the last tick
 *   ("2026-11-02:morning"), or null.
 * @param {string|null} current - The period under way now, or null.
 * @returns {Array<{key: string, data: object}>} The events.
 */
function detectPeak(previous, current) {
  if (previous === current) return [];
  const data = (id) => {
    const [date, period] = id.split(':');
    const spec = TENSION_PERIODS.find((entry) => entry.key === period);
    return { date, period, start: clock(spec.start), end: clock(spec.end) };
  };
  const events = [];
  if (previous) events.push({ key: TRIGGERS.PP_PEAK_ENDED, data: data(previous) });
  if (current) events.push({ key: TRIGGERS.PP_PEAK_STARTED, data: data(current) });
  return events;
}

export {
  TRIGGERS,
  WHEN,
  MEMORY_DAYS,
  whenOf,
  clock,
  detectPpDays,
  detectDemandResponseDays,
  detectPeak,
};
