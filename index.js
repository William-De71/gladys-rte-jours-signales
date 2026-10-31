// -----------------------------------------------------------------------------
// Entry point of the RTE flagged days external integration.
//
// The days RTE flags on the French grid, through the official RTE APIs and
// the user's own application of the RTE data portal:
//   - devices: "RTE PP days" (today, tomorrow, the day after, peak period now,
//     PP days of the season and left) and "RTE demand response days" (today,
//     tomorrow, flagged days of the year), offered on the Discovery screen
//     (see src/device.js);
//   - scene triggers: PP day announced, peak period started / ended, demand
//     response day announced;
//   - dashboard widgets: PP days, demand response days.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: only to guess the language; RTE days are
//   always counted in French time)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the RTE flagged days integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
