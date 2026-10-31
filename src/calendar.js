// -----------------------------------------------------------------------------
// French calendar of the RTE signals, always in Europe/Paris time whatever the
// timezone of Gladys: RTE days run from midnight to midnight in French time,
// and so do the peak periods.
//
// PP days (capacity mechanism from 1 November 2026, CRE deliberation
// 2026-24 of 27 January 2026, rules proposed by RTE):
//   - delivery period ("season") from 1 November to 31 March;
//   - at most 22 PP days per season, among the working days: Monday to
//     Friday, school holidays included, French public holidays excluded;
//   - announced the day before at 9:30, or as a forecast from D-2 before
//     noon (RTE advises reading at 9:45, 12:15 and 19:15);
//   - on a PP day, the peak periods are 7:00-10:00 and 17:00-20:00.
//
// Dates are "YYYY-MM-DD" strings (French calendar days), instants are ms.
// -----------------------------------------------------------------------------

const ZONE = 'Europe/Paris';
const DAY_MS = 24 * 60 * 60 * 1000;
const PP_STOCK = 22;
// Peak periods of a PP day, in minutes since midnight (French time).
const TENSION_PERIODS = [
  { key: 'morning', start: 7 * 60, end: 10 * 60 },
  { key: 'evening', start: 17 * 60, end: 20 * 60 },
];

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * @description The French calendar day and time of an instant.
 * @param {number} ms - The instant.
 * @returns {{ date: string, minutes: number }} "YYYY-MM-DD" and minutes since midnight.
 */
function parisParts(ms) {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description The French calendar day of an instant.
 * @param {number} ms - The instant.
 * @returns {string} "YYYY-MM-DD".
 */
const dateOf = (ms) => parisParts(ms).date;

/**
 * @description The fields of a date.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {{ year: number, month: number, day: number }} The fields.
 */
function fieldsOf(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/**
 * @description A date some days later (or earlier).
 * @param {string} date - "YYYY-MM-DD".
 * @param {number} days - Days to add.
 * @returns {string} "YYYY-MM-DD".
 */
function addDays(date, days) {
  const { year, month, day } = fieldsOf(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * @description Days from one date to another.
 * @param {string} from - "YYYY-MM-DD".
 * @param {string} to - "YYYY-MM-DD".
 * @returns {number} Whole days (negative when `to` is earlier).
 */
function daysBetween(from, to) {
  const utc = (date) => {
    const { year, month, day } = fieldsOf(date);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/**
 * @description The day of the week of a date.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {number} 0 Sunday … 6 Saturday.
 */
function weekday(date) {
  const { year, month, day } = fieldsOf(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * @description The instant of midnight (French time) at the start of a date.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {number} The instant, in ms.
 */
function midnightOf(date) {
  const { year, month, day } = fieldsOf(date);
  // France is UTC+1 in winter and UTC+2 in summer; the clock never changes
  // at midnight, so one of the two is right.
  for (const hours of [1, 2]) {
    const ms = Date.UTC(year, month - 1, day) - hours * 60 * 60 * 1000;
    const parts = parisParts(ms);
    if (parts.date === date && parts.minutes === 0) return ms;
  }
  return Date.UTC(year, month - 1, day);
}

/**
 * @description Midnight of a date in the RTE parameter format
 * (YYYY-MM-DDThh:mm:sszzzzzz), with its French offset.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {string} For example "2026-11-02T00:00:00+01:00".
 */
function rteMidnight(date) {
  const { year, month, day } = fieldsOf(date);
  const offsetHours = Math.round((Date.UTC(year, month - 1, day) - midnightOf(date)) / 3600000);
  return `${date}T00:00:00+0${offsetHours}:00`;
}

/**
 * @description Easter Sunday of a year (anonymous Gregorian algorithm).
 * @param {number} year - The year.
 * @returns {string} "YYYY-MM-DD".
 */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @description Whether a date is a French national public holiday.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {boolean} A public holiday.
 */
function isPublicHoliday(date) {
  const { year } = fieldsOf(date);
  const fixed = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'];
  if (fixed.includes(date.slice(5))) return true;
  const easter = easterSunday(year);
  // Easter Monday, Ascension Day, Whit Monday.
  return [1, 39, 50].some((days) => addDays(easter, days) === date);
}

/**
 * @description The PP season (delivery period) of a date: the one under
 * way, or the next one between April and October.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {{ start: string, end: string, label: string, active: boolean }}
 *   First day, day after the last one (31 March + 1), "2026-2027", and
 *   whether the date is inside it.
 */
function seasonOf(date) {
  const { year, month } = fieldsOf(date);
  const first = month <= 3 ? year - 1 : year;
  const start = `${first}-11-01`;
  const end = `${first + 1}-04-01`;
  return { start, end, label: `${first}-${first + 1}`, active: date >= start && date < end };
}

/**
 * @description Whether RTE may make a date a PP day: inside a season, Monday
 * to Friday, not a public holiday.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {boolean} Eligible.
 */
function isPpEligible(date) {
  const day = weekday(date);
  return seasonOf(date).active && day >= 1 && day <= 5 && !isPublicHoliday(date);
}

/**
 * @description The peak period an instant falls in, on any day.
 * @param {number} ms - The instant.
 * @returns {string|null} "morning", "evening" or null.
 */
function tensionPeriodAt(ms) {
  const { minutes } = parisParts(ms);
  return (
    TENSION_PERIODS.find((period) => minutes >= period.start && minutes < period.end)?.key ?? null
  );
}

/**
 * @description The instant of a French time on a date.
 * @param {string} date - "YYYY-MM-DD".
 * @param {number} minutes - Minutes since midnight.
 * @returns {number} The instant, in ms (the clock changes at 2-3 a.m.,
 *   never at the times this is used for).
 */
function instantOf(date, minutes) {
  const midnight = midnightOf(date);
  const guess = midnight + minutes * 60 * 1000;
  const drift = parisParts(guess).minutes - minutes;
  return guess - drift * 60 * 1000;
}

export {
  ZONE,
  DAY_MS,
  PP_STOCK,
  TENSION_PERIODS,
  parisParts,
  dateOf,
  addDays,
  daysBetween,
  weekday,
  midnightOf,
  rteMidnight,
  easterSunday,
  isPublicHoliday,
  seasonOf,
  isPpEligible,
  tensionPeriodAt,
  instantOf,
};
