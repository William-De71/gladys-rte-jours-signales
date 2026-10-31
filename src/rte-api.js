// -----------------------------------------------------------------------------
// Client of the official RTE APIs (data.rte-france.com), with the client id and
// client secret of an application the user creates on the RTE data portal.
//
//   POST https://digital.iservices.rte-france.com/token/oauth/
//        client credentials, Basic auth; the token lives 2 hours
//   GET  /open_api/signal/v2/signals                     "Signal" 2.0: PP days
//        ?start_date=…&end_date=…    (≥ 1 day, ≤ 366 days, end excluded)
//   GET  /open_api/demand_response_signal/v2/signals     "Demand Response
//        Signal" 2.0: flagged days of the demand response tender (AOE)
//        no parameter: today and tomorrow;
//        ?start_date=YYYY-01-01…&end_date=(YYYY+1)-01-01: a whole year
//
// Each API needs its own subscription on the portal ("Subscribe to API"):
// an application that is not subscribed gets a 403 for that API only, so the
// two are reported apart (SubscriptionError).
//
// RTE publishes no quota but answers 429 with a Retry-After past it; the
// integration reads a few times a day, one request at a time. The secret and
// the tokens are never logged nor put in an error message.
// -----------------------------------------------------------------------------

const API_HOST = 'https://digital.iservices.rte-france.com';
const TOKEN_PATH = '/token/oauth/';
const PATHS = {
  pp: '/open_api/signal/v2/signals',
  demand_response: '/open_api/demand_response_signal/v2/signals',
};
const TIMEOUT_MS = 20 * 1000;
// Renew the token this long before it expires.
const TOKEN_MARGIN_MS = 60 * 1000;
// At least this long between two requests.
const MIN_INTERVAL_MS = 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The client id / secret pair is refused. */
class CredentialsError extends Error {
  /**
   * @param {string} reason - MISSING, INVALID_CLIENT, UNAUTHORIZED…
   * @param {number|null} status - HTTP status.
   */
  constructor(reason, status = null) {
    super(`RTE refused the credentials (${reason})`);
    this.name = 'CredentialsError';
    this.reason = reason;
    this.status = status;
  }
}

/** The application is not subscribed to this API (403). */
class SubscriptionError extends Error {
  /** @param {string} api - pp or demand_response. */
  constructor(api) {
    super(`The RTE application is not subscribed to the ${api} API (403)`);
    this.name = 'SubscriptionError';
    this.api = api;
  }
}

/** RTE asks to slow down (429). */
class RateLimitError extends Error {
  /** @param {number} retryAfterMs - The wait RTE asked for, or ours. */
  constructor(retryAfterMs) {
    super('RTE limits the requests (429)');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Any other HTTP error of the API. */
class ApiError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} code - The short RTE error code, if any.
   */
  constructor(status, code = '') {
    super(`RTE API error ${status}${code ? ` (${code})` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The API cannot be reached (DNS, timeout, connection refused). */
class NetworkError extends Error {
  /** @param {string} message - What failed. */
  constructor(message) {
    super(`RTE API unreachable: ${message}`);
    this.name = 'NetworkError';
  }
}

/**
 * @description The short code of an RTE error answer
 * (`{ error, error_description }`), bounded and free of any secret.
 * @param {object|null} body - The parsed answer.
 * @returns {string} The code.
 */
function errorCode(body) {
  const code = typeof body?.error === 'string' ? body.error : '';
  return code.replace(/[^\w.-]/g, '').slice(0, 80);
}

/**
 * @description Create an RTE API client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - `fetch` (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {number} [options.minIntervalMs] - Spacing of two requests.
 * @param {number} [options.timeoutMs] - Timeout of a request.
 * @param {string} [options.userAgent] - User-Agent header.
 * @returns {object} The client.
 * @example
 * const api = createRteApi();
 * api.setCredentials(id, secret);
 * const body = await api.getPpSignals('2026-11-01T00:00:00+01:00', '2026-11-05T00:00:00+01:00');
 */
function createRteApi({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minIntervalMs = MIN_INTERVAL_MS,
  timeoutMs = TIMEOUT_MS,
  userAgent = 'gladys-rte-jours-signales',
} = {}) {
  let id = '';
  let secret = '';
  let token = null;
  let tokenRefreshAt = 0;
  let tokenRequest = null;
  let queue = Promise.resolve();
  let nextSlot = 0;
  const sentAt = [];

  /** @description Forget the requests older than a day. */
  function prune() {
    const limit = now() - 24 * HOUR_MS;
    while (sentAt.length && sentAt[0] < limit) sentAt.shift();
  }

  /**
   * @description Run one HTTP exchange in the queue, spaced from the
   * previous one.
   * @param {string} url - The URL.
   * @param {object} init - The fetch options.
   * @returns {Promise<{status: number, body: object|null, headers: object}>} The answer.
   */
  function exchange(url, init) {
    const run = async () => {
      const wait = nextSlot - now();
      if (wait > 0) await sleep(wait);
      nextSlot = now() + minIntervalMs;
      sentAt.push(now());
      prune();
      let response;
      try {
        response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? 'network');
        throw new NetworkError(reason);
      }
      const text = await response.text().catch(() => '');
      let body = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return { status: response.status, body, headers: response.headers };
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  /**
   * @description The wait RTE asked for after a 429.
   * @param {object} headers - The answer headers.
   * @returns {number} Milliseconds (5 minutes when RTE says nothing).
   */
  function retryAfter(headers) {
    const seconds = Number(headers?.get?.('retry-after'));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5 * 60 * 1000;
  }

  /** @description Request a new access token (client credentials). */
  async function fetchToken() {
    if (!id || !secret) throw new CredentialsError('MISSING');
    const basic = Buffer.from(`${id}:${secret}`, 'utf8').toString('base64');
    const answer = await exchange(`${API_HOST}${TOKEN_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        'User-Agent': userAgent,
      },
      body: 'grant_type=client_credentials',
    });
    if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
    if ([400, 401, 403].includes(answer.status)) {
      const code = errorCode(answer.body);
      throw new CredentialsError(code ? code.toUpperCase() : 'UNAUTHORIZED', answer.status);
    }
    if (answer.status >= 400) throw new ApiError(answer.status, errorCode(answer.body));
    const accessToken = answer.body?.access_token;
    const expiresIn = Number(answer.body?.expires_in);
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new ApiError(answer.status, 'no_access_token');
    }
    token = accessToken;
    const lifetime = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : HOUR_MS;
    tokenRefreshAt = now() + Math.max(0, lifetime - TOKEN_MARGIN_MS);
    return token;
  }

  /** @description A valid access token (shared by concurrent callers). */
  async function accessToken() {
    if (token && now() < tokenRefreshAt) return token;
    if (!tokenRequest) {
      tokenRequest = fetchToken().finally(() => {
        tokenRequest = null;
      });
    }
    return tokenRequest;
  }

  /**
   * @description GET the signals of an API.
   * @param {string} api - pp or demand_response.
   * @param {{ start?: string, end?: string }} [period] - RTE dates, or none.
   * @returns {Promise<object>} The parsed answer (`{ signals: [] }` on a 404).
   */
  async function get(api, { start, end } = {}) {
    const query =
      start && end ? `?${new URLSearchParams({ start_date: start, end_date: end })}` : '';
    let renewed = false;
    for (;;) {
      const bearer = await accessToken();
      const answer = await exchange(`${API_HOST}${PATHS[api]}${query}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
          'User-Agent': userAgent,
        },
      });
      if (answer.status === 401) {
        // An expired or revoked token: one new token, then give up.
        token = null;
        if (renewed) throw new CredentialsError('UNAUTHORIZED', 401);
        renewed = true;
        continue;
      }
      if (answer.status === 403) throw new SubscriptionError(api);
      if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
      // "The resource does not exist or no data was found."
      if (answer.status === 404) return { signals: [] };
      if (answer.status >= 400) throw new ApiError(answer.status, errorCode(answer.body));
      return answer.body ?? {};
    }
  }

  return {
    /**
     * @description Use these credentials from now on (drops the token).
     * @param {string} clientId - The client id.
     * @param {string} clientSecret - The client secret.
     */
    setCredentials(clientId, clientSecret) {
      const changed = clientId !== id || clientSecret !== secret;
      id = clientId ?? '';
      secret = clientSecret ?? '';
      if (changed) {
        token = null;
        tokenRefreshAt = 0;
      }
    },
    hasCredentials: () => Boolean(id && secret),
    /**
     * @param {string} start - First day, RTE format.
     * @param {string} end - Day after the last one, RTE format.
     * @returns {Promise<object>} The PP signals of the period.
     */
    getPpSignals: (start, end) => get('pp', { start, end }),
    /**
     * @param {{ start?: string, end?: string }} [period] - A whole year, or
     *   nothing for today and tomorrow.
     * @returns {Promise<object>} The demand response signals.
     */
    getDemandResponseSignals: (period) => get('demand_response', period),
    /** @returns {number} Requests sent during the last 24 hours. */
    requestsLastDay() {
      prune();
      return sentAt.length;
    },
  };
}

export {
  API_HOST,
  TOKEN_PATH,
  PATHS,
  CredentialsError,
  SubscriptionError,
  RateLimitError,
  ApiError,
  NetworkError,
  createRteApi,
};
