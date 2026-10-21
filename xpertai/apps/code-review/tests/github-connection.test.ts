import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConnectorRuntimeCapability, DefaultRuntimeCapabilityRegistry, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  type AgentMiddlewareRuntimeScope, type PluginContext } from '@xpert-ai/plugin-sdk'
import { GitHubApp } from '../src/github-app.js'
import { githubConnectionSchema } from '../src/github-connection.js'
import { viewScope, reviewRuntimeScope } from '../src/runtime-scope.js'

const scope = viewScope({ tenantId: 'tenant', organizationId: 'organization', workspaceId: 'workspace',
  userId: 'user', hostType: 'agent', hostId: 'assistant' })
const token = 'private-connector-fixture'

function fixture() {
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  const scopes: AgentMiddlewareRuntimeScope[] = []
  capabilities.register(ConnectorRuntimeCapability, {
    getConnector: async () => { throw new Error('Legacy API must not be used') },
    getConnectorCredential: async input => {
      assert.deepEqual(input, { provider: 'github' })
      return { connectorId: 'binding', bindingId: 'binding', scope: { type: 'workspace', workspaceId: 'workspace' },
        authorizationMode: 'shared', provider: 'github', authMethodId: 'pat', credentials: { accessToken: token },
        profile: { login: 'previous-login', email: 'private@example.invalid' } }
    }
  })
  const context = { resolve(key: string) {
    assert.equal(key, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    return { createScopedApi(s: AgentMiddlewareRuntimeScope) { scopes.push(s); return { capabilities } } }
  } } as PluginContext
  return { app: new GitHubApp(context), capabilities, scopes }
}

test('connection status validates the scoped Connector and returns only the current GitHub login', async t => {
  const f = fixture()
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://api.github.com/user')
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${token}`)
    return Response.json({ login: 'current-login', email: 'private@example.invalid', extra: token })
  })
  const result = await f.app.connection(scope)
  assert.deepEqual(result, { status: 'connected', login: 'current-login' })
  assert.deepEqual(f.scopes, [reviewRuntimeScope(scope)])
  assert.doesNotMatch(JSON.stringify(result), /private-connector|email|previous-login/)
})

test('a revoked GitHub token clears the connected account', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }))
  assert.deepEqual(await fixture().app.connection(scope), { status: 'disconnected' })
})

test('rate limits, transport failures and malformed profiles do not claim disconnection or expose details', async t => {
  for (const response of [() => new Response('', { status: 429 }), () => { throw new Error(token) },
    () => Response.json({ email: 'private@example.invalid' })]) {
    const mocked = t.mock.method(globalThis, 'fetch', async () => response())
    assert.deepEqual(await fixture().app.connection(scope), { status: 'unavailable' })
    mocked.mock.restore()
  }
})

test('the view contract strips credentials and requires an account for connected status', () => {
  assert.deepEqual(githubConnectionSchema.parse({ status: 'connected', login: 'tiven-w', credentials: { accessToken: token } }),
    { status: 'connected', login: 'tiven-w' })
  assert.equal(githubConnectionSchema.safeParse({ status: 'connected' }).success, false)
})
