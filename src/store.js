// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (mode
// 0600, the only writable place of the container):
//   - `ppDays`: day -> `{ pp, updated }`, the PP signals of the last seasons;
//   - `drDays`: day -> `{ code, updated }`, the demand response signals;
//   - `announced`: `{ pp: { day: true }, dr: { day: code } }`, the days a
//     scene trigger already fired for;
//   - `peak`: the peak period under way at the last tick ("2026-11-02:morning").
// Nothing secret is stored. A missing or unreadable file is an empty state.
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';

const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/**
 * @description An empty or validated state.
 * @param {object} [parsed] - What the file held.
 * @returns {object} The state.
 */
function shapeOf(parsed = {}) {
  return {
    ppDays: object(parsed.ppDays),
    drDays: object(parsed.drDays),
    announced: { pp: object(parsed.announced?.pp), dr: object(parsed.announced?.dr) },
    peak: typeof parsed.peak === 'string' ? parsed.peak : null,
  };
}

/**
 * @description Create the store.
 * @param {object} [options] - Options.
 * @param {string|null} [options.path] - The file (null: memory only, tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The store: `data` and `save()`.
 */
function createStore({ path = DEFAULT_PATH, logger = null } = {}) {
  let data = shapeOf();
  let written = JSON.stringify(data);

  if (path) {
    try {
      data = shapeOf(JSON.parse(readFileSync(path, 'utf8')));
      written = JSON.stringify(data);
    } catch (err) {
      if (err.code !== 'ENOENT') logger?.warn(`Unreadable ${path}, starting afresh`);
    }
  }

  return {
    get data() {
      return data;
    },
    /** @description Write the file when something changed (atomically). */
    save() {
      const text = JSON.stringify(data);
      if (text === written || !path) return;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        writeFileSync(temporary, text, { mode: 0o600 });
        renameSync(temporary, path);
        written = text;
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
}

export { DEFAULT_PATH, createStore };
