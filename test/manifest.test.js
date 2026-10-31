import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { TRIGGERS, WHEN } from '../src/events.js';
import { ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { AUTO_LANGUAGE } from '../src/config.js';
import { DR_KINDS } from '../src/signals.js';
import { TENSION_PERIODS } from '../src/calendar.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const REPO = 'William-De71/gladys-rte-jours-signales';

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'RTE Jours signalés');
  assert.equal(manifest.version, pkg.version);
  assert.match(pkg.version, /^0\./);
  assert.equal(
    manifest.docker_image,
    `ghcr.io/william-de71/gladys-rte-jours-signales:${pkg.version}`,
  );
  assert.equal(manifest.cover_image, `https://raw.githubusercontent.com/${REPO}/main/cover.jpg`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-rte-jours-signales');
});

test('declares the cloud transport: the RTE APIs only, never a local device', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.match(source('../src/rte-api.js'), /https:\/\/digital\.iservices\.rte-france\.com/);
  for (const file of [
    'app',
    'calendar',
    'device',
    'events',
    'signals',
    'widgets',
    'store',
    'config',
    'i18n',
  ]) {
    assert.doesNotMatch(
      source(`../src/${file}.js`),
      /fetch\(|node:https?|node:net|node:dgram/,
      file,
    );
  }
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
});

test('Gladys 5.3.0, energy, France only, no widget form, no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/, 'no button form');
  assert.deepEqual(manifest.categories, ['energy']);
  assert.deepEqual(manifest.countries, ['FR']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  const config = byKey(manifest.config_schema);
  assert.deepEqual(
    [config.get('client_id').type, config.get('client_id').required],
    ['string', true],
  );
  assert.deepEqual(
    [config.get('client_secret').type, config.get('client_secret').required],
    ['secret', true],
  );
  assert.equal(config.get('client_secret').default, undefined);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  const app = source('../src/app.js');
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key),
    Object.values(TRIGGERS),
  );
  assert.equal(manifest.scene_actions, undefined, 'no scene action');
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    Object.values(WIDGETS),
  );
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
    assert.match(app, new RegExp(`onWidgetAction\\(WIDGETS\\.${key}`), key);
  }
  assert.deepEqual(Object.values(WIDGET_ACTIONS), ['refresh']);
  assert.deepEqual(
    manifest.actions.map((a) => a.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('the trigger fields and variables mirror the event data', () => {
  const triggers = byKey(manifest.scene_triggers);
  const announced = triggers.get('pp_day_announced');
  assert.deepEqual(values(byKey(announced.fields).get('when')), WHEN.slice(0, 3));
  assert.deepEqual(
    announced.variables.map((v) => v.key),
    ['date', 'when', 'days_ahead', 'season_count', 'season_remaining'],
  );
  for (const key of ['pp_peak_started', 'pp_peak_ended']) {
    const trigger = triggers.get(key);
    assert.deepEqual(
      values(byKey(trigger.fields).get('period')),
      TENSION_PERIODS.map((period) => period.key),
    );
    assert.deepEqual(
      trigger.variables.map((v) => v.key),
      ['date', 'period', 'start', 'end'],
    );
  }
  const dr = triggers.get('demand_response_day_announced');
  assert.deepEqual(values(byKey(dr.fields).get('kind')), Object.values(DR_KINDS));
  assert.deepEqual(values(byKey(dr.fields).get('when')), ['today', 'tomorrow']);
  assert.deepEqual(
    dr.variables.map((v) => [v.key, v.type]),
    [
      ['date', 'string'],
      ['when', 'string'],
      ['days_ahead', 'number'],
      ['kind', 'string'],
      ['explicit', 'boolean'],
      ['implicit', 'boolean'],
      ['year_count', 'number'],
    ],
  );
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields) assert.ok(!field.required, `${trigger.key}: empty = any`);
  }
});

test('the configuration mirrors the code', () => {
  const config = byKey(manifest.config_schema);
  const language = config.get('language');
  assert.deepEqual(values(language), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(language.default, AUTO_LANGUAGE);
  const intro = config.get('intro');
  assert.equal(intro.type, 'section');
  assert.deepEqual(
    intro.links.map((link) => link.url),
    [
      'https://data.rte-france.com/catalog/-/api/market/Signal/v2.0',
      'https://data.rte-france.com/catalog/-/api/market/Demand-Response-Signal/v2.0',
    ],
  );
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.actions.length <= 10);
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of manifest.actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('catalog keywords of Gladys 5.3.0', () => {
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10, 'one to ten keywords');
  keywords.forEach((keyword) => assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword));
  assert.equal(new Set(keywords).size, keywords.length, 'unique once trimmed and lowercased');
});
