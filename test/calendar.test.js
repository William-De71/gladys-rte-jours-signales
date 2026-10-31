import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parisParts,
  addDays,
  daysBetween,
  midnightOf,
  rteMidnight,
  easterSunday,
  isPublicHoliday,
  seasonOf,
  isPpEligible,
  tensionPeriodAt,
  instantOf,
} from '../src/calendar.js';

test('French days and times, whatever the timezone of Gladys', () => {
  assert.deepEqual(parisParts(Date.parse('2026-11-01T23:30:00Z')), {
    date: '2026-11-02',
    minutes: 30,
  });
  assert.deepEqual(parisParts(Date.parse('2026-07-01T22:30:00Z')), {
    date: '2026-07-02',
    minutes: 30,
  });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(daysBetween('2026-11-02', '2026-11-04'), 2);
  assert.equal(daysBetween('2026-11-02', '2026-10-31'), -2);
});

test('midnight in the RTE format, with the winter or summer offset', () => {
  assert.equal(rteMidnight('2026-11-02'), '2026-11-02T00:00:00+01:00');
  assert.equal(rteMidnight('2026-06-10'), '2026-06-10T00:00:00+02:00');
  // The clocks change at 2-3 a.m.: midnight keeps the offset of the day before.
  assert.equal(rteMidnight('2027-03-28'), '2027-03-28T00:00:00+01:00');
  assert.equal(rteMidnight('2026-10-25'), '2026-10-25T00:00:00+02:00');
  assert.equal(midnightOf('2026-11-02'), Date.parse('2026-11-01T23:00:00Z'));
  assert.equal(instantOf('2026-11-02', 9 * 60 + 45), Date.parse('2026-11-02T08:45:00Z'));
  assert.equal(instantOf('2027-03-28', 12 * 60), Date.parse('2027-03-28T10:00:00Z'));
});

test('French public holidays, Easter Monday included', () => {
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2026), '2026-04-05');
  for (const day of ['2026-11-01', '2026-11-11', '2026-12-25', '2027-01-01', '2027-03-29']) {
    assert.equal(isPublicHoliday(day), true, day);
  }
  assert.equal(isPublicHoliday('2026-11-02'), false);
  assert.equal(isPublicHoliday('2027-05-06'), true, 'Ascension 2027');
});

test('the PP season runs from 1 November to 31 March', () => {
  assert.deepEqual(seasonOf('2026-11-02'), {
    start: '2026-11-01',
    end: '2027-04-01',
    label: '2026-2027',
    active: true,
  });
  assert.equal(seasonOf('2027-03-31').active, true);
  assert.equal(seasonOf('2027-03-31').label, '2026-2027');
  assert.deepEqual(seasonOf('2026-10-31'), {
    start: '2026-11-01',
    end: '2027-04-01',
    label: '2026-2027',
    active: false,
  });
});

test('PP days: working days of the season, public holidays excluded', () => {
  assert.equal(isPpEligible('2026-11-02'), true, 'a Monday');
  assert.equal(isPpEligible('2026-11-07'), false, 'a Saturday');
  assert.equal(isPpEligible('2026-11-11'), false, 'Armistice Day');
  assert.equal(isPpEligible('2026-12-24'), true, 'school holidays count');
  assert.equal(isPpEligible('2027-03-29'), false, 'Easter Monday');
  assert.equal(isPpEligible('2027-04-01'), false, 'after the season');
  assert.equal(isPpEligible('2026-10-30'), false, 'before the season');
});

test('the peak periods: 7-10 h and 17-20 h, French time', () => {
  assert.equal(tensionPeriodAt(Date.parse('2026-11-02T05:59:00Z')), null);
  assert.equal(tensionPeriodAt(Date.parse('2026-11-02T06:00:00Z')), 'morning');
  assert.equal(tensionPeriodAt(Date.parse('2026-11-02T08:59:00Z')), 'morning');
  assert.equal(tensionPeriodAt(Date.parse('2026-11-02T09:00:00Z')), null);
  assert.equal(tensionPeriodAt(Date.parse('2026-11-02T16:00:00Z')), 'evening');
  assert.equal(tensionPeriodAt(Date.parse('2026-11-02T19:00:00Z')), null);
});
