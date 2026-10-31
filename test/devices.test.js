// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { buildDevice, buildStates, typeOfExternalId, DEVICE_TYPES } from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';

const fakeGladys = createFakeGladys({});
const devices = (language) =>
  Object.values(DEVICE_TYPES).map((type) => buildDevice(fakeGladys, type, language));

// The pairs the front labels (front/src/config/i18n:
// deviceFeatureCategory.<category>.<type>), the risk badge (0 no risk,
// 1 low, 2 medium, 3 high) and the integer counter. Neither carries a unit.
const PAIRS = [
  [CATEGORIES.RISK, TYPES.RISK.INTEGER],
  [CATEGORIES.COUNTER_SENSOR, TYPES.SENSOR.INTEGER],
];

test('devices are never polled by Gladys: the integration has its own clock', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      assert.ok(device.name, device.external_id);
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(feature.read_only, true, feature.external_id);
        assert.equal(feature.has_feedback, false, feature.external_id);
        assert.ok(feature.name, feature.external_id);
        assert.equal(feature.key, undefined, 'no internal field');
        assert.equal(feature.unit, undefined, feature.external_id);
      }
    }
  }
});

test('every category / type pair is a known one', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (feature.category === CATEGORIES.RISK) {
        assert.deepEqual([feature.min, feature.max], [0, 3], 'the four badges of the risk');
      }
    }
  }
});

test('both devices, their names and features in every language, distinct', () => {
  const names = (language) => devices(language).map((device) => device.name);
  assert.deepEqual(names('fr'), ['Jours PP RTE', 'Jours signalés effacement RTE']);
  assert.deepEqual(names('en'), ['RTE PP days', 'RTE demand response days']);
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      const featureNames = device.features.map((feature) => feature.name);
      assert.equal(new Set(featureNames).size, featureNames.length, `${language} ${device.name}`);
    }
  }
  assert.deepEqual(
    devices('en').map((device) => device.features.length),
    [6, 3],
  );
});

test('states: only the known values, and the external ids lead back to the device', () => {
  const states = buildStates(fakeGladys, DEVICE_TYPES.PP, { today: 3, tomorrow: 0, peak_now: NaN });
  assert.deepEqual(
    states.map((state) => [state.device_feature_external_id.split(':').pop(), state.state]),
    [
      ['today', 3],
      ['tomorrow', 0],
    ],
  );
  const [pp, dr] = devices('en');
  assert.equal(typeOfExternalId(fakeGladys, pp.external_id), DEVICE_TYPES.PP);
  assert.equal(typeOfExternalId(fakeGladys, dr.external_id), DEVICE_TYPES.DEMAND_RESPONSE);
  assert.equal(typeOfExternalId(fakeGladys, 'ext:other:x'), null);
});

test('the discovery batch is accepted by the fake Gladys', async () => {
  const gladys = createFakeGladys({});
  await gladys.connect();
  await gladys.publishDiscoveredDevices(devices('fr'));
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});
