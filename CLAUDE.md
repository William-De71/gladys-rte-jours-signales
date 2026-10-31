# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the days RTE flags on the
French power grid: the PP days of the capacity mechanism (from 1 November 2026) and the demand response days of the demand response tender. A Node.js
service (Node 22+, ESM, no build step) that runs in its own sandboxed Docker
container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The data comes from the official **RTE APIs**
"Signal" 2.0 and "Demand Response Signal" 2.0 (data.rte-france.com), with the
client id and client secret of the user's own application (OAuth2 client
credentials). Transport: cloud.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run coverage                          # tests with the coverage of node --test
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the clock
                        (tick: due readings, day change, peak periods), the
                        readings of both APIs, the errors, the status
src/rte-api.js          the HTTP client: token (client credentials, renewed a
                        minute before it expires), one request at a time,
                        error classes (credentials, subscription, 429…);
                        never logs a secret
src/calendar.js         French time: days, midnight in the RTE format, public
                        holidays, the PP season, eligible days, peak periods
src/signals.js          the RTE answers -> day maps, the level of a day
src/device.js           the two Gladys devices, their features and states
src/events.js           scene trigger detection (announced days, peak periods)
src/widgets.js          PP days and demand response dashboard widgets
src/store.js            /data/state.json: days read, days already announced
src/config.js           configuration (credentials, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: the device
  external ids `ext:<selector>:pp:france` and
  `ext:<selector>:demand_response:france`, the feature keys (`today`,
  `tomorrow`, `day_after`, `peak_now`, `season_count`, `season_remaining`,
  `year_count`), feature `category` / `type` / `min` / `max`, the keys of
  `config_schema`, `actions`, the select values (`auto`, `en`…), the widgets,
  the widget button action (`refresh`), the scene triggers (fields, options,
  variables). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs**: `risk` / `integer` (0 normal, 1 not known yet,
  3 flagged: the badges of the EcoWatt signal in Gladys) and
  `counter-sensor` / `integer`. A scene compares these numbers: never change
  their meaning.
- **French time always**: an RTE day runs from midnight to midnight in
  Europe/Paris, whatever `TZ` says; `TZ` only guesses the language.
- **`should_poll` stays false**: the integration reads on its own clock at the
  RTE publication times (PP: 00:05, 09:45, 12:15, 19:15; demand response:
  00:05, 11:15, the whole year once a day), plus every 30 minutes while
  tomorrow is unknown in the day, 15 minutes after a failure, 1 hour after
  refused credentials, 6 hours after a 403 (API not subscribed), and as RTE
  asks after a 429. Up to 2 minutes of random delay so that every Gladys does
  not call at the same second. Never read RTE more often.
- **PP rules** (CRE deliberation 2026-24): season 1 November - 31 March, 22
  days, Monday to Friday without French public holidays, peak periods
  7:00-10:00 and 17:00-20:00. Change `src/calendar.js` if RTE changes them.
- **The client secret** is a `secret`: never logged, never in /data, never in a
  scene variable nor an error message; neither is the access token.
- **Scene events**: one per announced day (kept in /data across restarts, a
  day taken back by RTE is forgotten and may fire again), one per start and
  end of a peak period.
- **Gladys does not pass DEBUG / LOG_LEVEL to the container**: never tell a
  store user to set them; "Test the connection" is the diagnostic button.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Sources.** The API facts come from the RTE user guides, the PP rules
  from the CRE deliberation (both in NOTICE); the Home Assistant
  `rte-jours-signales` component gave the idea, no code was copied.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `>=5.3.0` for `keywords`; `countries: ["FR"]`; no permission.
  Transport: `["cloud"]`.
- **CI smoke test.** `ci.yml` counts the features of the PP device (6) and of
  the demand response device (3) in the Docker image: update it with the
  features.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
