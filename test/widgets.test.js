import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildPpWidget,
  buildDemandResponseWidget,
  peakRow,
  WIDGET_ACTIONS,
  MAX_ITEMS,
} from '../src/widgets.js';
import { LEVEL } from '../src/signals.js';
import { LANGUAGES } from '../src/i18n.js';

const NOW = Date.parse('2026-12-14T07:42:00Z');
const SEASON_DAYS = [
  '2026-11-17',
  '2026-11-18',
  '2026-12-01',
  '2026-12-02',
  '2026-12-10',
  '2026-12-14',
  '2026-12-15',
];
const pp = (overrides = {}) =>
  buildPpWidget({
    status: 'ok',
    lastSuccessAt: NOW - 3 * 60000,
    today: '2026-12-14',
    minutes: 8 * 60 + 42,
    levels: { today: LEVEL.SIGNALED, tomorrow: LEVEL.SIGNALED, day_after: LEVEL.PENDING },
    season: { label: '2026-2027', active: true, days: SEASON_DAYS },
    language: 'en',
    now: NOW,
    ...overrides,
  });
const dr = (overrides = {}) =>
  buildDemandResponseWidget({
    status: 'ok',
    lastSuccessAt: NOW - 60000,
    today: '2026-12-14',
    levels: { today: LEVEL.SIGNALED, tomorrow: LEVEL.PENDING },
    kinds: { today: 'implicit', tomorrow: null },
    year: {
      year: 2026,
      days: [
        { day: '2026-01-12', kind: 'explicit' },
        { day: '2026-12-14', kind: 'implicit' },
      ],
    },
    language: 'en',
    now: NOW,
    ...overrides,
  });

/**
 * @description The components the core would keep, and what it would remove.
 * @param {object} content - The widget content.
 * @returns {object} The result of validateWidgetContent.
 */
function check(content) {
  const result = validateWidgetContent(content);
  assert.deepEqual(result.removed ?? [], [], JSON.stringify(result.removed));
  return result;
}

test('every widget content passes the checks of the core, in every language and state', () => {
  for (const language of LANGUAGES) {
    for (const status of [
      'ok',
      'unknown',
      'unconfigured',
      'refused',
      'unsubscribed',
      'rate_limited',
      'error',
    ]) {
      check(pp({ language, status }));
      check(pp({ language, status, lastSuccessAt: 0 }));
      check(dr({ language, status }));
      check(dr({ language, status, lastSuccessAt: 0 }));
    }
    check(pp({ language, season: { label: '2026-2027', active: false, days: [] } }));
    check(dr({ language, year: { year: 2027, days: [] } }));
  }
});

test('the PP widget: the three days, the peak periods, the count and the latest days', () => {
  const { components } = pp();
  const status = components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((row) => [row.label, row.value, row.color]),
    [
      ['Today', 'PP day', 'danger'],
      ['Peak periods', 'Now, until 10:00', 'danger'],
      ['Tomorrow', 'PP day', 'danger'],
      ['Day after tomorrow', 'Not announced yet', 'warning'],
    ],
  );
  const tiles = components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    ['7/22', 15],
  );
  const list = components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, MAX_ITEMS);
  assert.deepEqual(
    list.items.slice(0, 2).map((item) => [item.title, item.badge?.text]),
    [
      ['Tue, December 15', 'Coming'],
      ['Mon, December 14', 'Today'],
    ],
  );
  assert.equal(list.items.at(-1).badge, undefined, 'a past day');
  assert.deepEqual(components.at(-1).action, { key: WIDGET_ACTIONS.REFRESH });
  assert.equal(
    components.find((c) => c.variant === 'caption').text,
    'Season 2026-2027 · updated 3 min ago',
  );
});

test('the peak period row: under way, next, over', () => {
  assert.equal(peakRow(6 * 60, 'fr').value, 'Prochaine à 07:00');
  assert.equal(peakRow(12 * 60, 'fr').value, 'Prochaine à 17:00');
  assert.equal(peakRow(18 * 60, 'fr').value, 'En cours jusqu’à 20:00');
  assert.equal(peakRow(21 * 60, 'fr').value, 'Terminées pour aujourd’hui');
  const { components } = pp({ levels: { today: LEVEL.NORMAL, tomorrow: 0, day_after: 0 } });
  assert.equal(components[0].items.length, 3, 'no peak row on a normal day');
});

test('before any reading: the hint of the state and the button only', () => {
  const { components } = pp({ status: 'unsubscribed', lastSuccessAt: 0, language: 'fr' });
  assert.equal(components.length, 2);
  assert.match(components[0].text, /« Signal »/);
  const drHint = dr({ status: 'unsubscribed', lastSuccessAt: 0, language: 'fr' });
  assert.match(drHint.components[0].text, /Demand Response Signal/);
});

test('the demand response widget: today, tomorrow, the year', () => {
  const { components } = dr({ language: 'fr' });
  assert.deepEqual(
    components[0].items.map((row) => row.value),
    ['Signalé (implicite)', 'Pas encore publié'],
  );
  assert.equal(components[1].value, 2);
  assert.equal(components[1].label, 'Jours signalés en 2026');
  const list = components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle]),
    [
      ['lun. 14 décembre', 'implicite'],
      ['lun. 12 janvier', 'explicite'],
    ],
  );
});
