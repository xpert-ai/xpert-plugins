import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVerify, generateKeyPairSync, randomUUID } from 'node:crypto'
import { SYSTEM_GLOBAL_SCOPE, INTEGRATION_PERMISSION_SERVICE_TOKEN, ConnectorRuntimeCapability, DefaultRuntimeCapabilityRegistry,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, type PluginContext } from '@xpert-ai/plugin-sdk'
import { GitHubApp } from '../src/github-app.js'
import { resolveGitHubApplication, assertGitHubRepositoryApplication } from '../src/github-integration.js'
import { configSchema } from '../src/automation-domain.js'
import type { Scope } from '../src/domain.js'

const integrationId = randomUUID()
const scope: Scope = { tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace', userId: 'owner', assistantId: 'assistant' }
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKey = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const options = { appId: '42', appSlug: 'review-app', clientId: 'oauth-client', clientSecret: 'client-fixture',
  privateKey, webhookSecret: 'webhook-fixture'.repeat(4) }

function fixture() {
  const state = { integration: { id: integrationId, name: 'Review App', provider: 'github', tenantId: 'tenant',
    organizationId: null as string | null, options: { ...options } }, deleted: false, authMethodId: 'github-app-oauth', credentialIntegrationId: integrationId }
  const reads: unknown[] = []
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  capabilities.register(ConnectorRuntimeCapability, {
    getConnector: async () => { throw new Error('Legacy API forbidden') },
    getConnectorCredential: async () => ({ connectorId: 'binding', bindingId: 'binding', provider: 'github',
      authMethodId: state.authMethodId, scope: { type: 'workspace', workspaceId: 'workspace' }, authorizationMode: 'shared',
      credentials: { accessToken: 'user-fixture', integrationId: state.credentialIntegrationId, oauthClientId: options.clientId } })
  })
  const context = { config: { githubIntegrationId: integrationId }, tenantId: 'tenant', resolve(key: string) {
    if (key === INTEGRATION_PERMISSION_SERVICE_TOKEN) return { async readConfiguration(...args: unknown[]) {
      reads.push(args); return state.deleted ? null : state.integration
    } }
    assert.equal(key, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    return { createScopedApi: () => ({ capabilities }) }
  } } as PluginContext
  return { state, reads, context, app: new GitHubApp(context) }
}

test('reference-only configuration uses the built-in read capability, resolves afresh and only projects safe status', async () => {
  const f = fixture()
  assert.deepEqual(configSchema.parse({ githubIntegrationId: integrationId }), { githubIntegrationId: integrationId })
  const resolved = await resolveGitHubApplication(f.context)
  assert.equal(resolved?.privateKey, privateKey)
  assert.deepEqual(f.reads, [[integrationId]])
  const status = await f.app.status(scope)
  assert.equal(status.integrationName, 'Review App')
  assert.equal(status.installUrl, 'https://github.com/apps/review-app/installations/new')
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE KEY|client-fixture|webhook-fixture|oauth-client/)
  f.state.integration.options.webhookSecret = 'rotated-fixture'.repeat(4)
  assert.equal((await f.app.config())?.webhookSecret, f.state.integration.options.webhookSecret)
})

test('system callbacks use only the host configuration capability and preserve review tenant isolation', async () => {
  const f = fixture()
  f.context.tenantId = null
  f.context.scopeKey = SYSTEM_GLOBAL_SCOPE
  assert.equal((await f.app.config())?.integrationId, integrationId)
  assert.deepEqual(f.reads, [[integrationId]])
  await assert.rejects(f.app.config({ ...scope, tenantId: 'foreign' }), /github_integration_unavailable/)
  f.state.deleted = true
  await assert.rejects(f.app.config(), /github_integration_unavailable/)
  assert.equal(f.reads.length, 3)
})

test('older hosts without configuration reads fail closed without using legacy runtime reads', async () => {
  let legacyReads = 0
  const context = { config: { githubIntegrationId: integrationId }, resolve: () => ({
    read: async () => { legacyReads++; return null }
  }) } as PluginContext
  await assert.rejects(resolveGitHubApplication(context), /github_integration_unavailable/)
  assert.equal(legacyReads, 0)
})

test('unavailable, mismatched ID and wrong-provider integrations fail closed without fallback', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.state.deleted = true },
    (f: ReturnType<typeof fixture>) => { f.state.integration.id = randomUUID() },
    (f: ReturnType<typeof fixture>) => { f.state.integration.provider = 'other' }
  ]) {
    const f = fixture(); change(f)
    await assert.rejects(f.app.config(), /github_integration_unavailable/)
    assert.equal((await f.app.status(scope)).configured, false)
    assert.equal(f.reads.length, 2)
  }
  const f = fixture()
  await assert.rejects(f.app.config({ ...scope, tenantId: 'other' }), /github_integration_unavailable/)
  assert.equal(f.reads.length, 1)
  f.state.integration.options.clientSecret = ''
  await assert.rejects(f.app.config(scope), /github_integration_incomplete/)
})

test('selecting a reference removes legacy secrets and never uses them as fallback', async () => {
  const legacy = { appId: '42', slug: 'review-app', privateKey, publicBaseUrl: 'https://example.invalid' }
  assert.deepEqual(await resolveGitHubApplication({ config: { githubApp: legacy } } as PluginContext), legacy)
  assert.deepEqual(configSchema.parse({ githubIntegrationId: integrationId, githubApp: legacy }), { githubIntegrationId: integrationId })
  assert.equal(configSchema.safeParse({ githubIntegrationId: 'invalid', githubApp: legacy }).success, false)
  const context = { config: { githubIntegrationId: integrationId }, tenantId: 'tenant', resolve: () => ({ readConfiguration: async () => null }) } as PluginContext
  await assert.rejects(resolveGitHubApplication(context), /github_integration_unavailable/)
})

test('OAuth credentials must carry the required integration; PAT or a different App cannot pass', async t => {
  const f = fixture()
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ login: 'review-owner' }))
  assert.deepEqual(await f.app.connection(scope), { status: 'connected', login: 'review-owner', integrationId })
  f.state.credentialIntegrationId = randomUUID()
  assert.deepEqual(await f.app.connection(scope), { status: 'integration_mismatch' })
  await assert.rejects(f.app.inspect(scope, 'owner', 'repo'), /github_integration_mismatch/)
  f.state.credentialIntegrationId = integrationId; f.state.authMethodId = 'pat'
  assert.deepEqual(await f.app.connection(scope), { status: 'integration_mismatch' })
  f.state.authMethodId = 'github-app-oauth'; f.state.integration.options.clientId = 'changed-client'
  assert.deepEqual(await f.app.connection(scope), { status: 'integration_mismatch' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('App installation and restricted bot tokens use the selected integration and guard pinned identity', async t => {
  const f = fixture()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++
    const auth = new Headers(init.headers).get('authorization')!.slice('Bearer '.length)
    if (url.endsWith('/repos/owner/repo')) {
      assert.equal(auth, 'user-fixture')
      return Response.json({ id: 77, name: 'repo', owner: { login: 'owner' }, permissions: { push: true } })
    }
    const [header, body, signature] = auth.split('.')
    const verifier = createVerify('RSA-SHA256'); verifier.update(`${header}.${body}`)
    assert.equal(verifier.verify(keys.publicKey, Buffer.from(signature, 'base64url')), true)
    assert.equal(JSON.parse(Buffer.from(body, 'base64url').toString()).iss, '42')
    if (url.endsWith('/installation')) return Response.json({ id: 88, permissions: { contents: 'read', pull_requests: 'write' } })
    assert.equal(url, 'https://api.github.com/app/installations/88/access_tokens')
    assert.deepEqual(JSON.parse(String(init.body)), { repository_ids: [77], permissions: { contents: 'read', pull_requests: 'write' } })
    return Response.json({ token: 'bot-fixture' })
  })
  const binding = await f.app.inspect(scope, 'owner', 'repo')
  assert.equal(binding.githubIntegrationId, integrationId); assert.equal(binding.githubAppId, '42')
  assert.ok(await f.app.installation('88', '77', scope, binding))
  f.state.integration.options.appId = '43'
  await assert.rejects(f.app.installation('88', '77', scope, binding), /github_repository_revalidation_required/)
  f.state.integration.options.appId = '42'
  await assert.rejects(f.app.installation('88', '77', scope, { githubIntegrationId: null, githubAppId: null }), /github_repository_revalidation_required/)
  assert.equal(calls, 3)
  const config = await f.app.config(scope)
  assert.ok(config)
  assert.throws(() => assertGitHubRepositoryApplication(config, { ...binding, githubIntegrationId: randomUUID() }), /revalidation_required/)
})
