// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a made-up winter morning (Monday 14 December 2026,
// 8:42, French time): today and tomorrow are PP days, the morning peak period
// is under way, seven PP days so far this season; today is also a flagged
// demand response day (implicit), tomorrow not published yet.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildPpWidget, buildDemandResponseWidget } = await load('src/widgets.js');
const { LEVEL } = await load('src/signals.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const NOW = Date.parse('2026-12-14T07:42:00Z');
const TODAY = '2026-12-14';
const SEASON_DAYS = [
  '2026-11-17',
  '2026-11-18',
  '2026-12-01',
  '2026-12-02',
  '2026-12-10',
  '2026-12-14',
  '2026-12-15',
];
const DR_DAYS = [
  { day: '2026-01-12', kind: 'explicit' },
  { day: '2026-01-13', kind: 'explicit_implicit' },
  { day: '2026-02-04', kind: 'implicit' },
  { day: '2026-12-02', kind: 'implicit' },
  { day: '2026-12-14', kind: 'implicit' },
];

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    pp_days: buildPpWidget({
      status: 'ok',
      lastSuccessAt: NOW - 57 * 60 * 1000,
      today: TODAY,
      minutes: 8 * 60 + 42,
      levels: { today: LEVEL.SIGNALED, tomorrow: LEVEL.SIGNALED, day_after: LEVEL.PENDING },
      season: { label: '2026-2027', active: true, days: SEASON_DAYS },
      language,
      now: NOW,
    }),
    demand_response: buildDemandResponseWidget({
      status: 'ok',
      lastSuccessAt: NOW - 57 * 60 * 1000,
      today: TODAY,
      levels: { today: LEVEL.SIGNALED, tomorrow: LEVEL.PENDING },
      kinds: { today: 'implicit', tomorrow: null },
      year: { year: 2026, days: DR_DAYS },
      language,
      now: NOW,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
