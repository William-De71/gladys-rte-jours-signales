// -----------------------------------------------------------------------------
// A fake RTE client with the shape of src/rte-api.js, answering like the user
// guides of "Signal" 2.0 and "Demand Response Signal" 2.0 (the JSON examples
// of the guides, with made-up days). Never the network.
// -----------------------------------------------------------------------------

/**
 * @description RTE date of a French day at midnight (winter time is enough
 * for the made-up days).
 * @param {string} day - "YYYY-MM-DD".
 * @param {string} [offset] - "+01:00" or "+02:00".
 * @returns {string} The RTE date.
 */
const rte = (day, offset = '+01:00') => `${day}T00:00:00${offset}`;

/**
 * @description A day after another one.
 * @param {string} day - "YYYY-MM-DD".
 * @returns {string} The next day.
 */
const next = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/**
 * @description A "Signal" answer.
 * @param {object} days - Day -> true / false.
 * @param {string} [start] - start_date of the answer.
 * @param {string} [end] - end_date of the answer.
 * @returns {object} The answer.
 */
function ppAnswer(days, start = rte('2026-11-01'), end = rte('2026-11-10')) {
  const values = Object.entries(days)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, value]) => ({
      start_date: rte(day),
      end_date: rte(next(day)),
      value,
      updated_date: `${day}T09:30:00+01:00`,
    }));
  return { signals: [{ start_date: start, end_date: end, type: 'PP', values }] };
}

/**
 * @description A "Demand Response Signal" answer.
 * @param {object} days - Day -> aoe_signals code.
 * @returns {object} The answer.
 */
function drAnswer(days) {
  const signaled = Object.entries(days)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, code]) => ({
      start_date: rte(day),
      end_date: rte(next(day)),
      updated_date: `${day}T11:13:59+01:00`,
      aoe_signals: code,
    }));
  return {
    signals: [
      { start_date: rte('2026-01-01'), end_date: rte('2027-01-01'), signaled_dates: signaled },
    ],
  };
}

/**
 * @description A fake RTE client.
 * @param {object} [options] - Options.
 * @param {object} [options.pp] - Day -> true / false, what "Signal" knows.
 * @param {object} [options.dr] - Day -> code, what "Demand Response Signal" knows.
 * @param {string[]} [options.drCurrent] - The days the parameterless call
 *   returns (today and tomorrow; all the known days by default).
 * @returns {object} The client, with `calls`, `pp`, `dr`, `errors`.
 */
function fakeApi({ pp = {}, dr = {}, drCurrent = null } = {}) {
  let id = '';
  let secret = '';
  const fake = {
    calls: [],
    pp: { ...pp },
    dr: { ...dr },
    drCurrent,
    // errors.pp / errors.demand_response: an Error to throw.
    errors: {},
    setCredentials(clientId, clientSecret) {
      id = clientId;
      secret = clientSecret;
    },
    hasCredentials: () => Boolean(id && secret),
    async getPpSignals(start, end) {
      fake.calls.push(['pp', start, end]);
      if (fake.errors.pp) throw fake.errors.pp;
      const from = start.slice(0, 10);
      const to = end.slice(0, 10);
      const days = Object.fromEntries(
        Object.entries(fake.pp).filter(([day]) => day >= from && day < to),
      );
      return ppAnswer(days, start, end);
    },
    async getDemandResponseSignals(period) {
      fake.calls.push(['demand_response', period?.start ?? null]);
      if (fake.errors.demand_response) throw fake.errors.demand_response;
      if (period) {
        const year = period.start.slice(0, 4);
        return drAnswer(
          Object.fromEntries(Object.entries(fake.dr).filter(([day]) => day.startsWith(year))),
        );
      }
      const days = fake.drCurrent ?? Object.keys(fake.dr);
      return drAnswer(
        Object.fromEntries(days.filter((d) => d in fake.dr).map((d) => [d, fake.dr[d]])),
      );
    },
    requestsLastDay: () => fake.calls.length,
  };
  return fake;
}

export { rte, ppAnswer, drAnswer, fakeApi };
