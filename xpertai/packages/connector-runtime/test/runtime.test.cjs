const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const {
  createCredentialDriver, createPollingDriver, pollBeforeDeadline,
  createPkce, oauthTokenRequest, createStandardOAuth2Driver, requestOAuth2Token
} = require('../dist/index.js')
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
const connect = { authMethodId: 'oauth', state: 'host-state', redirectUri: 'https://host.example/callback' }
const descriptor = {
  kind: 'oauth2', authMethodId: 'oauth', encoding: 'form', clientAuthentication: 'client_secret_basic',
  authorizationEndpoint: 'https://vendor.example/authorize', tokenEndpoint: 'https://vendor.example/token',
  pkce: true, scopes: ['read', 'write'], resource: 'https://vendor.example/mcp'
}
const app = { integrationId: 'fixture-integration', clientId: 'fixture-client', clientSecret: 'fixture-secret' }

test('credential driver validates both new values and legacy stored data; never activates before verification', async () => {
  let calls = 0
  let allow = false
  const driver = createCredentialDriver({
    kind: 'api_key', authMethodId: 'key', scopes: ['read'],
    parse(values) {
      if (typeof values?.apiKey !== 'string' || !values.apiKey.trim()) throw Error('invalid key')
      return { apiKey: values.apiKey.trim() }
    },
    async verify() { calls++; if (!allow) throw Error('rejected by vendor') },
    profile: () => ({ name: 'Vendor' })
  })
  await assert.rejects(driver.connect({ ...connect, authMethodId: 'unknown' }), /Unsupported/)
  await assert.rejects(driver.connect({ ...connect, authMethodId: 'key', values: {} }), /invalid/)
  assert.equal(calls, 0)
  await assert.rejects(driver.connect({ ...connect, authMethodId: 'key', values: { apiKey: 'secret' } }), /rejected/)
  allow = true
  const result = await driver.connect({ ...connect, authMethodId: 'key', values: { apiKey: ' secret ', injected: 'no' } })
  assert.deepEqual(result, { status: 'active', credential: { data: { apiKey: 'secret' }, scopes: ['read'], profile: { name: 'Vendor' } } })
  assert.deepEqual(driver.resolveRuntimeCredential({ authMethodId: 'key', credential: { data: { apiKey: 'legacy' } } }), { apiKey: 'legacy' })
})

test('mail protocol verifies before exposing an account and preserves the existing credential codec', async () => {
  const driver = createCredentialDriver({ kind: 'mail_protocol', authMethodId: 'imap', parse: values => ({ email: values.email, authorizationCode: values.authorizationCode }), verify: async () => { throw Error('IMAP rejected') } })
  await assert.rejects(driver.connect({ ...connect, authMethodId: 'imap', values: { email: 'test@example.com', authorizationCode: 'fixture' } }), /IMAP rejected/)
})

test('polling refuses expired and malformed deadlines without calling the vendor', async () => {
  let calls = 0
  const driver = createPollingDriver({ kind: 'polling', assertAuthMethod: id => assert.equal(id, 'oauth'), readPending: metadata => metadata, expiresAt: pending => pending.expiresAt, intervalSeconds: 2, expiredMessage: 'expired', poll: async () => { calls++; return { status: 'pending' } } })
  for (const expiresAt of ['invalid', new Date(Date.now() - 1000).toISOString()]) {
    assert.deepEqual(await driver.pollConnection({ ...connect, metadata: { expiresAt } }), { status: 'error', error: 'expired' })
  }
  assert.equal(calls, 0)
  const metadata = { version: 1, handle: 'encrypted-session', expiresAt: new Date(Date.now() + 60000).toISOString() }
  assert.deepEqual(await driver.pollConnection({ ...connect, metadata }), { status: 'pending', pollIntervalSeconds: 2, metadata })
})

test('legacy phased polling preserves advanced state and explicit missing-deadline compatibility', async () => {
  const next = { status: 'pending', metadata: { phase: 'user_authorization', interval: 10 }, pollIntervalSeconds: 10 }
  assert.deepEqual(await pollBeforeDeadline({ allowMissingDeadline: true, expiredMessage: 'expired' }, async () => next), next)
  assert.deepEqual(await pollBeforeDeadline({ expiredMessage: 'expired' }, async () => next), { status: 'error', error: 'expired' })
})

test('S256 PKCE has sufficient entropy and a matching challenge', () => {
  const a = createPkce(), b = createPkce(48)
  assert.equal(a.codeVerifier.length, 43)
  assert.notEqual(a.codeVerifier, b.codeVerifier)
  assert.equal(a.codeChallenge, createHash('sha256').update(a.codeVerifier).digest('base64url'))
  assert.throws(() => createPkce(8), /entropy/)
})

test('all OAuth transports refuse redirects and carry a deadline; provider encoding is explicit', async () => {
  const requests = []
  global.fetch = async (url, init) => { requests.push({ url, init }); return new Response('{}') }
  for (const encoding of ['form', 'json', 'query']) {
    await oauthTokenRequest({ endpoint: descriptor.tokenEndpoint, encoding, values: { code: 'a+b', client_secret: 'fixture' } })
  }
  assert.equal(requests[0].init.body.get('code'), 'a+b')
  assert.equal(JSON.parse(requests[1].init.body).code, 'a+b')
  assert.equal(new URL(requests[2].url).searchParams.get('code'), 'a+b')
  assert.equal(requests[2].init.method, 'GET')
  for (const { init } of requests) { assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal) }
  for (const endpoint of ['http://vendor.example/token', 'https://user:secret@vendor.example/token', 'https://vendor.example/token#fragment']) {
    assert.throws(() => oauthTokenRequest({ endpoint, encoding: 'form', values: {} }), /HTTPS/)
  }
  assert.equal(requests.length, 3)
})

test('client authentication uses exactly the configured channel', async () => {
  const requests = []
  global.fetch = async (url, init) => { requests.push(init); return new Response('{}') }
  for (const clientAuthentication of ['client_secret_basic', 'client_secret_post', 'none']) {
    await requestOAuth2Token({ ...descriptor, clientAuthentication }, app, { grant_type: 'refresh_token', client_id: 'injected', client_secret: 'injected' })
  }
  assert.equal(requests[0].body.has('client_id'), false)
  assert.equal(requests[0].body.has('client_secret'), false)
  assert.equal(requests[0].headers.Authorization, `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`)
  assert.equal(requests[1].body.get('client_secret'), app.clientSecret)
  assert.equal(requests[1].headers.Authorization, undefined)
  assert.equal(requests[2].body.has('client_secret'), false)
})

test('descriptor-only OAuth provider completes code exchange, scopes, refresh and runtime credential projection', async () => {
  const requests = []
  const phases = []
  global.fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(JSON.stringify(requests.length === 1
      ? { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }
      : { access_token: 'access-2', expires_in: '3600' }))
  }
  const driver = createStandardOAuth2Driver(descriptor, { resolveApp: async context => { phases.push(context.phase); return app } })
  const started = await driver.connect({ ...connect, scopes: ['read'] })
  const url = new URL(started.authorizationUrl)
  assert.equal(url.searchParams.get('scope'), 'read')
  assert.equal(url.searchParams.get('resource'), descriptor.resource)
  assert.equal(url.searchParams.get('state'), connect.state)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(!JSON.stringify(started).includes(app.clientSecret))
  const credential = await driver.exchangeAuthorizationCode({ ...connect, code: 'fixture-code', metadata: started.metadata })
  assert.equal(requests[0].init.body.get('code_verifier'), started.metadata.codeVerifier)
  assert.equal(requests[0].init.body.get('resource'), descriptor.resource)
  assert.deepEqual(credential.scopes, ['read'])
  const refreshed = await driver.refreshConnectionCredential({ authMethodId: 'oauth', credential })
  assert.equal(refreshed.data.refreshToken, 'refresh-1')
  assert.equal(requests[1].init.body.get('refresh_token'), 'refresh-1')
  assert.deepEqual(refreshed.scopes, ['read'])
  assert.deepEqual(driver.resolveRuntimeCredential({ authMethodId: 'oauth', credential: refreshed }), { accessToken: 'access-2', tokenType: 'Bearer' })
  assert.deepEqual(phases, ['connect', 'exchange', 'refresh'])
})

test('OAuth refuses unsupported methods, scope escalation, callback swaps, changed clients and missing PKCE', async () => {
  let requests = 0
  global.fetch = async () => { requests++; return new Response('{}') }
  let resolvedApp = app
  const driver = createStandardOAuth2Driver(descriptor, { resolveApp: async () => resolvedApp })
  await assert.rejects(driver.connect({ ...connect, authMethodId: 'other' }), /Unsupported/)
  await assert.rejects(driver.connect({ ...connect, scopes: ['admin'] }), /not allowed/)
  const started = await driver.connect(connect)
  const exchange = { ...connect, code: 'code', metadata: started.metadata }
  await assert.rejects(driver.exchangeAuthorizationCode({ ...exchange, redirectUri: 'https://evil.example/callback' }), /redirect/)
  await assert.rejects(driver.exchangeAuthorizationCode({ ...exchange, metadata: { ...started.metadata, codeVerifier: undefined } }), /PKCE/)
  resolvedApp = { ...app, clientId: 'changed-client' }
  await assert.rejects(driver.exchangeAuthorizationCode(exchange), /configuration changed/)
  assert.equal(requests, 0)
})

test('OAuth token failure does not echo secrets and never returns an active credential', async () => {
  global.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'secret-token-reflected' }), { status: 400 })
  const driver = createStandardOAuth2Driver(descriptor, { resolveApp: async () => app })
  const started = await driver.connect(connect)
  await assert.rejects(driver.exchangeAuthorizationCode({ ...connect, code: 'code', metadata: started.metadata }), error => {
    assert.match(error.message, /HTTP 400/)
    assert.ok(!error.message.includes('secret-token-reflected'))
    return true
  })
})
