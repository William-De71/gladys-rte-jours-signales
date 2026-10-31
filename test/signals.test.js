import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL,
  parsePp,
  parseDemandResponse,
  seasonPpDays,
  ppLevel,
  drLevel,
  yearDrDays,
} from '../src/signals.js';

// The JSON example of the "Signal" 2.0 user guide.
const PP_GUIDE = {
  signals: [
    {
      start_date: '2026-11-02T00:00:00+01:00',
      end_date: '2026-11-04T00:00:00+01:00',
      type: 'PP',
      values: [
        {
          start_date: '2026-11-02T00:00:00+01:00',
          end_date: '2026-11-03T00:00:00+01:00',
          value: true,
          updated_date: '2026-10-31T12:00:00+01:00',
        },
      ],
    },
  ],
};

// The JSON example of the "Demand Response Signal" 2.0 user guide.
const DR_GUIDE = {
  signals: [
    {
      start_date: '2024-01-04T00:00:00+01:00',
      end_date: '2024-01-06T00:00:00+01:00',
      signaled_dates: [
        {
          start_date: '2024-01-05T00:00:00+01:00',
          end_date: '2024-01-06T00:00:00+01:00',
          updated_date: '2024-01-04T11:13:59+01:00',
          aoe_signals: 0,
        },
        {
          start_date: '2024-01-04T00:00:00+01:00',
          end_date: '2024-01-05T00:00:00+01:00',
          updated_date: '2024-01-04T11:13:59+01:00',
          aoe_signals: 0,
        },
      ],
    },
  ],
};

test('the example of the Signal guide', () => {
  assert.deepEqual(
    [...parsePp(PP_GUIDE)],
    [['2026-11-02', { pp: true, updated: Date.parse('2026-10-31T11:00:00Z') }]],
  );
});

test('the example of the Demand Response Signal guide', () => {
  const days = parseDemandResponse(DR_GUIDE);
  assert.deepEqual([...days.keys()], ['2024-01-05', '2024-01-04']);
  assert.equal(days.get('2024-01-04').code, 0);
});

test('malformed entries are skipped, never thrown', () => {
  assert.deepEqual([...parsePp(null)], []);
  assert.deepEqual([...parsePp({ signals: [{ type: 'PP1', values: [] }] })], []);
  assert.deepEqual(
    [...parsePp({ signals: [{ type: 'PP', values: [{ start_date: 'x', value: true }, {}] }] })],
    [],
  );
  assert.deepEqual(
    [
      ...parseDemandResponse({
        signals: [
          { signaled_dates: [{ start_date: '2026-11-02T00:00:00+01:00', aoe_signals: 7 }] },
        ],
      }),
    ],
    [],
  );
});

test('the level of a PP day', () => {
  const days = { '2026-11-02': { pp: true }, '2026-11-03': { pp: false } };
  assert.equal(ppLevel('2026-11-02', days), LEVEL.SIGNALED);
  assert.equal(ppLevel('2026-11-03', days), LEVEL.NORMAL);
  assert.equal(ppLevel('2026-11-04', days), LEVEL.PENDING, 'a working day, not announced');
  assert.equal(ppLevel('2026-11-07', days), LEVEL.NORMAL, 'a Saturday');
  assert.equal(ppLevel('2026-06-10', days), LEVEL.NORMAL, 'off season');
  // The 22 days are used up: nothing pending any more.
  const full = {};
  let day = new Date(Date.UTC(2026, 10, 2));
  while (Object.keys(full).length < 22) {
    if (day.getUTCDay() >= 1 && day.getUTCDay() <= 5) {
      full[day.toISOString().slice(0, 10)] = { pp: true };
    }
    day = new Date(day.getTime() + 86400000);
  }
  assert.equal(seasonPpDays(full, '2027-02-01').length, 22);
  assert.equal(ppLevel('2027-02-01', full), LEVEL.NORMAL);
});

test('the PP days of a season and the flagged days of a year', () => {
  const pp = {
    '2026-03-02': { pp: true },
    '2026-11-02': { pp: true },
    '2026-11-03': { pp: false },
    '2027-01-05': { pp: true },
  };
  assert.deepEqual(seasonPpDays(pp, '2027-01-20'), ['2026-11-02', '2027-01-05']);
  const dr = { '2026-01-05': { code: 2 }, '2026-01-06': { code: 0 }, '2025-12-01': { code: 1 } };
  assert.deepEqual(yearDrDays(dr, 2026), ['2026-01-05']);
  assert.equal(drLevel('2026-01-05', dr), LEVEL.SIGNALED);
  assert.equal(drLevel('2026-01-06', dr), LEVEL.NORMAL);
  assert.equal(drLevel('2026-01-07', dr), LEVEL.PENDING);
});
