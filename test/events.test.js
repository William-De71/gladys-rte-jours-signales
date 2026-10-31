import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPpDays,
  detectDemandResponseDays,
  detectPeak,
  whenOf,
  MEMORY_DAYS,
} from '../src/events.js';

const SEASON = { count: 3, remaining: 19 };

/**
 * @description Check a scene event payload against the limits of the core.
 * @param {object} data - The data.
 */
function flat(data) {
  assert.ok(Object.keys(data).length <= 30);
  for (const value of Object.values(data)) {
    assert.ok(
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
      JSON.stringify(value),
    );
    if (typeof value === 'string') assert.ok(value.length <= 1000);
  }
}

test('a PP day fires once, today or ahead; the past only updates the memory', () => {
  const days = {
    '2026-11-02': { pp: true },
    '2026-11-03': { pp: false },
    '2026-11-04': { pp: true },
    '2026-10-01': { pp: true },
  };
  const first = detectPpDays({}, days, '2026-11-02', SEASON);
  assert.deepEqual(
    first.events.map((event) => [event.data.date, event.data.when, event.data.days_ahead]),
    [
      ['2026-11-02', 'today', 0],
      ['2026-11-04', 'day_after', 2],
    ],
  );
  first.events.forEach((event) => flat(event.data));
  assert.deepEqual(Object.keys(first.announced).sort(), ['2026-10-01', '2026-11-02', '2026-11-04']);
  const again = detectPpDays(first.announced, days, '2026-11-02', SEASON);
  assert.deepEqual(again.events, []);
  // RTE takes a day back, then flags it again: it fires again.
  const back = detectPpDays(
    again.announced,
    { ...days, '2026-11-04': { pp: false } },
    '2026-11-02',
    SEASON,
  );
  assert.equal(back.announced['2026-11-04'], undefined);
  const flagged = detectPpDays(back.announced, days, '2026-11-02', SEASON);
  assert.equal(flagged.events.length, 1);
});

test('a demand response day fires once per kind', () => {
  const first = detectDemandResponseDays({}, { '2026-11-03': { code: 1 } }, '2026-11-02', 4);
  assert.deepEqual(first.events[0].data, {
    date: '2026-11-03',
    when: 'tomorrow',
    days_ahead: 1,
    kind: 'explicit',
    explicit: true,
    implicit: false,
    year_count: 4,
  });
  const same = detectDemandResponseDays(
    first.announced,
    { '2026-11-03': { code: 1 } },
    '2026-11-02',
    4,
  );
  assert.deepEqual(same.events, []);
  const both = detectDemandResponseDays(
    first.announced,
    { '2026-11-03': { code: 3 } },
    '2026-11-02',
    4,
  );
  assert.equal(both.events[0].data.kind, 'explicit_implicit');
  assert.equal(both.events[0].data.implicit, true);
  const none = detectDemandResponseDays({}, { '2026-11-03': { code: 0 } }, '2026-11-02', 4);
  assert.deepEqual(none.events, []);
});

test('the memory forgets the days older than 400 days', () => {
  const { announced } = detectPpDays(
    { '2025-01-06': true, '2026-01-06': true },
    {},
    '2026-11-02',
    SEASON,
  );
  assert.deepEqual(Object.keys(announced), ['2026-01-06']);
  assert.equal(MEMORY_DAYS, 400);
});

test('peak periods: start, end, and nothing when nothing changes', () => {
  assert.deepEqual(detectPeak(null, null), []);
  assert.deepEqual(detectPeak('2026-11-02:morning', '2026-11-02:morning'), []);
  assert.deepEqual(detectPeak(null, '2026-11-02:morning'), [
    {
      key: 'pp_peak_started',
      data: { date: '2026-11-02', period: 'morning', start: '07:00', end: '10:00' },
    },
  ]);
  assert.deepEqual(
    detectPeak('2026-11-02:evening', null).map((event) => [event.key, event.data.end]),
    [['pp_peak_ended', '20:00']],
  );
  assert.deepEqual([0, 1, 2, 3, 9].map(whenOf), [
    'today',
    'tomorrow',
    'day_after',
    'later',
    'later',
  ]);
});
