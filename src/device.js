// -----------------------------------------------------------------------------
// Two Gladys devices, one per RTE API, offered in Discovery once the API has
// answered (an application subscribed to one API only gets one device):
//
//   "RTE PP days" (type `pp`)
//     key               category / type          min max  value
//     today             risk / integer           0   3    0 normal, 1 not announced yet, 3 PP day
//     tomorrow          risk / integer           0   3    same
//     day_after         risk / integer           0   3    same (RTE may announce at D-2)
//     peak_now          risk / integer           0   3    3 inside 7-10 a.m. or 5-8 p.m. of a PP day, else 0
//     season_count      counter-sensor / integer 0   22   PP days of the season so far
//     season_remaining  counter-sensor / integer 0   22   PP days RTE may still flag
//
//   "RTE demand response days" (type `demand_response`)
//     today             risk / integer           0   3    0 not flagged, 1 not published yet, 3 flagged
//     tomorrow          risk / integer           0   3    same
//     year_count        counter-sensor / integer 0   366  flagged days of the calendar year
//
// The risk category is the one of the EcoWatt signal in Gladys (badge "no
// risk" green, "low" yellow, "high" red), so a scene compares the numbers
// above. The ids are built from a fixed platform id ("france": there is one
// French grid) and never change; the feature keys, categories, types and
// bounds are forever too (test/structure.test.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import { PP_STOCK } from './calendar.js';
import { t } from './i18n.js';

const PLATFORM_ID = 'france';
const DEVICE_TYPES = { PP: 'pp', DEMAND_RESPONSE: 'demand_response' };

const readOnly = { read_only: true, has_feedback: false };
const level = { category: CATEGORIES.RISK, type: TYPES.RISK.INTEGER, min: 0, max: 3, ...readOnly };
const counter = (max) => ({
  category: CATEGORIES.COUNTER_SENSOR,
  type: TYPES.SENSOR.INTEGER,
  min: 0,
  max,
  ...readOnly,
});

// Order = order of the features in Gladys.
const FEATURES = {
  [DEVICE_TYPES.PP]: [
    { key: 'today', ...level },
    { key: 'tomorrow', ...level },
    { key: 'day_after', ...level },
    { key: 'peak_now', ...level },
    { key: 'season_count', ...counter(PP_STOCK) },
    { key: 'season_remaining', ...counter(PP_STOCK) },
  ],
  [DEVICE_TYPES.DEMAND_RESPONSE]: [
    { key: 'today', ...level },
    { key: 'tomorrow', ...level },
    { key: 'year_count', ...counter(366) },
  ],
};

/**
 * @description The ids of a device.
 * @param {object} gladys - The Gladys client (externalIds).
 * @param {string} type - A DEVICE_TYPES value.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, type) => gladys.externalIds(type, PLATFORM_ID);

/**
 * @description The Discovery payload of a device.
 * @param {object} gladys - The Gladys client.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} language - Language of the names.
 * @returns {object} The device.
 */
function buildDevice(gladys, type, language = 'en') {
  const ids = idsOf(gladys, type);
  return {
    name: t(`device_${type}`, language),
    external_id: ids.device,
    model: type === DEVICE_TYPES.PP ? 'Signal PP' : 'Demand Response Signal',
    should_poll: false,
    features: FEATURES[type].map(({ key, ...fields }) => ({
      ...fields,
      name: t(`feature_${type}_${key}`, language),
      external_id: ids.feature(key),
    })),
  };
}

/**
 * @description The states of a device.
 * @param {object} gladys - The Gladys client.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {object} values - Feature key -> number (missing: nothing published).
 * @returns {Array<{device_feature_external_id: string, state: number}>} The states.
 */
function buildStates(gladys, type, values) {
  const ids = idsOf(gladys, type);
  return FEATURES[type].flatMap(({ key }) =>
    Number.isFinite(values?.[key])
      ? [{ device_feature_external_id: ids.feature(key), state: values[key] }]
      : [],
  );
}

/**
 * @description The device type of an external id.
 * @param {object} gladys - The Gladys client.
 * @param {string} externalId - A device external id.
 * @returns {string|null} The type, or null.
 */
function typeOfExternalId(gladys, externalId) {
  return (
    Object.values(DEVICE_TYPES).find((type) => idsOf(gladys, type).device === externalId) ?? null
  );
}

export { PLATFORM_ID, DEVICE_TYPES, FEATURES, idsOf, buildDevice, buildStates, typeOfExternalId };
