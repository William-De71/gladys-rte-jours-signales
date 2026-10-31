// The HTTP client against a fake fetch: token, Bearer, parameters, errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRteApi,
  CredentialsError,
  SubscriptionError,
  RateLimitError,
  ApiError,
  NetworkError,
} from '../src/rte-api.js';

/**
 * @description A fake fetch answering from a list of handlers.
 * @param {Function} route - `(url, init) => { status, body, headers }`.
 * @returns {Function} The fetch, with `requests`.
 */
function fakeFetch(route) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const answer = await route(url, init, requests.length);
    if (answer instanceof Error) throw answer;
    const { status = 200, body = {}, headers = {} } = answer;
    return {
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    };
  };
  fetchImpl.requests = requests;
  return fetchImpl;
}

const TOKEN = { access_token: 'tok', token_type: 'Bearer', expires_in: 7200 };
const client = (fetchImpl, now = () => 0) =>
  createRteApi({ fetchImpl, now, sleep: async () => {}, minIntervalMs: 0 });

test('client credentials, then the signals with a Bearer token and the period', async () => {
  const fetchImpl = fakeFetch((url) =>
    url.endsWith('/token/oauth/') ? { body: TOKEN } : { body: { signals: [] } },
  );
  const api = client(fetchImpl);
  api.setCredentials('my-id', 'my-secret');
  await api.getPpSignals('2026-11-01T00:00:00+01:00', '2026-11-06T00:00:00+01:00');
  await api.getDemandResponseSignals();
  const [token, pp, dr] = fetchImpl.requests;
  assert.equal(token.init.method, 'POST');
  assert.equal(
    token.init.headers.Authorization,
    `Basic ${Buffer.from('my-id:my-secret').toString('base64')}`,
  );
  assert.equal(
    pp.url,
    'https://digital.iservices.rte-france.com/open_api/signal/v2/signals?start_date=2026-11-01T00%3A00%3A00%2B01%3A00&end_date=2026-11-06T00%3A00%3A00%2B01%3A00',
  );
  assert.equal(pp.init.headers.Authorization, 'Bearer tok');
  assert.equal(
    dr.url,
    'https://digital.iservices.rte-france.com/open_api/demand_response_signal/v2/signals',
  );
  assert.equal(fetchImpl.requests.length, 3, 'one token for both');
  assert.equal(api.requestsLastDay(), 3);
});

test('the token is renewed before it expires, and once on a 401', async () => {
  const clock = { now: 0 };
  let tokens = 0;
  let refused = true;
  const fetchImpl = fakeFetch((url) => {
    if (url.endsWith('/token/oauth/')) {
      tokens += 1;
      return { body: { ...TOKEN, access_token: `tok${tokens}` } };
    }
    if (refused) {
      refused = false;
      return { status: 401 };
    }
    return { body: { signals: [] } };
  });
  const api = client(fetchImpl, () => clock.now);
  api.setCredentials('id', 'secret');
  await api.getDemandResponseSignals();
  assert.equal(tokens, 2, 'a 401: one new token');
  clock.now += 7200 * 1000;
  await api.getDemandResponseSignals();
  assert.equal(tokens, 3, 'expired');
});

test('errors: credentials, subscription, 429, 400, 404, network', async () => {
  const cases = [
    [{ status: 401, body: { error: 'invalid_client' } }, null, CredentialsError, 'INVALID_CLIENT'],
    [{ body: TOKEN }, { status: 403 }, SubscriptionError, 'pp'],
    [{ body: TOKEN }, { status: 429, headers: { 'retry-after': '120' } }, RateLimitError, 120000],
    [
      { body: TOKEN },
      { status: 400, body: { error: 'SIGNAL_SIGNALS_F03', error_description: 'too long' } },
      ApiError,
      'SIGNAL_SIGNALS_F03',
    ],
    [{ body: TOKEN }, new TypeError('fetch failed'), NetworkError, null],
  ];
  for (const [token, answer, ErrorClass, detail] of cases) {
    const api = client(fakeFetch((url) => (url.endsWith('/token/oauth/') ? token : answer)));
    api.setCredentials('id', 'secret');
    const err = await api.getPpSignals('a', 'b').catch((e) => e);
    assert.ok(err instanceof ErrorClass, `${ErrorClass.name}: ${err}`);
    if (ErrorClass === CredentialsError) assert.equal(err.reason, detail);
    if (ErrorClass === SubscriptionError) assert.equal(err.api, detail);
    if (ErrorClass === RateLimitError) assert.equal(err.retryAfterMs, detail);
    if (ErrorClass === ApiError) assert.equal(err.code, detail);
    assert.doesNotMatch(String(err.message), /secret|tok/);
  }
  const api = client(
    fakeFetch((url) => (url.endsWith('/token/oauth/') ? { body: TOKEN } : { status: 404 })),
  );
  api.setCredentials('id', 'secret');
  assert.deepEqual(await api.getPpSignals('a', 'b'), { signals: [] }, '404: no data');
});

test('no credentials: no request at all', async () => {
  const fetchImpl = fakeFetch(() => ({ body: TOKEN }));
  const api = client(fetchImpl);
  assert.equal(api.hasCredentials(), false);
  const err = await api.getPpSignals('a', 'b').catch((e) => e);
  assert.equal(err.reason, 'MISSING');
  assert.equal(fetchImpl.requests.length, 0);
});
