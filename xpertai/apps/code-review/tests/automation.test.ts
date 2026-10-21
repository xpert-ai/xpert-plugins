import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac } from 'node:crypto'
import { configSchema, verifyWebhook, triggerDecision, ignoredPath, defaultPolicy, pullEventSchema, savePolicySchema } from '../src/automation-domain.js'
const secret = 'local-fixture-only'.repeat(3)
const raw = Buffer.from('{ "fixture": true }')
const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
const githubApp = { appId: '42', slug: 'review-fixture', privateKey: 'unused-fixture', publicBaseUrl: 'https://fixture.invalid' }
test('GitHub App configuration accepts an omitted or empty webhook secret', () => {
  assert.equal(configSchema.parse({ githubApp }).githubApp?.webhookSecret, undefined)
  for (const webhookSecret of [undefined, null, '', ' \t\n', ' '.repeat(32)]) {
    const config = configSchema.parse({ githubApp: { ...githubApp, webhookSecret } })
    assert.deepEqual(config.githubApp, { ...githubApp, webhookSecret: undefined })
  }
})
test('configured webhook secrets retain exact bytes and require at least 32 characters', () => {
  for (const webhookSecret of ['x'.repeat(32), secret, ` ${secret} `])
    assert.equal(configSchema.parse({ githubApp: { ...githubApp, webhookSecret } }).githubApp?.webhookSecret, webhookSecret)
  for (const webhookSecret of ['x', 'x'.repeat(31), 42, false, {}])
    assert.equal(configSchema.safeParse({ githubApp: { ...githubApp, webhookSecret } }).success, false)
})
test('saving without a webhook secret does not accept signed or unsigned webhook deliveries', () => {
  for (const webhookSecret of [undefined, '']) {
    const config = configSchema.parse({ githubApp: { ...githubApp, webhookSecret } })
    for (const sig of [undefined, signature])
      assert.throws(() => verifyWebhook(raw, sig, config.githubApp?.webhookSecret), /invalid_webhook_signature/)
  }
})
test('webhooks authenticate exact bytes and reject tampering, absent raw body and oversized input', () => {
  verifyWebhook(raw, signature, secret)
  for (const [body, sig, key] of [[Buffer.from('{"fixture":true}'), signature, secret], [raw, signature, 'wrong'], [undefined, signature, secret], [raw, 'sha256=xyz', secret], [Buffer.alloc(2 * 1024 * 1024 + 1), signature, secret]] as const)
    assert.throws(() => verifyWebhook(body, sig, key), /invalid_webhook_signature/)
})
const event = pullEventSchema.parse({ action: 'opened', installation: { id: 1 }, repository: { id: 2, name: 'repo', owner: { login: 'owner' } }, pull_request: { number: 5, title: 'PR', state: 'open', draft: false, head: { sha: 'a'.repeat(40) }, base: { ref: 'develop' }, user: { login: 'test', type: 'User' } } })
test('automation defaults require opt-in, exclude drafts and bots, respect exact branches and triggers', () => {
  assert.equal(triggerDecision(defaultPolicy, event), 'automation_paused')
  const enabled = { ...defaultPolicy, enabled: true }
  assert.equal(triggerDecision(enabled, event), null)
  assert.equal(triggerDecision(enabled, { ...event, pull_request: { ...event.pull_request, draft: true } }), 'draft_pull_request')
  assert.equal(triggerDecision(enabled, { ...event, pull_request: { ...event.pull_request, user: { login: 'bot', type: 'Bot' } } }), 'bot_pull_request')
  assert.equal(triggerDecision({ ...enabled, branches: ['main'] }, event), 'branch_excluded')
  assert.equal(triggerDecision(enabled, { ...event, action: 'edited' }), 'trigger_disabled')
  assert.equal(triggerDecision({ ...enabled, onPush: false }, { ...event, action: 'synchronize' }), 'trigger_disabled')
  assert.equal(triggerDecision(enabled, { ...event, action: 'ready_for_review' }), null)
})
test('ignored path globs respect directories and literal regexp characters', () => {
  assert(ignoredPath('package-lock.json', defaultPolicy.ignoredPaths))
  assert(ignoredPath('apps/web/pnpm-lock.yaml', defaultPolicy.ignoredPaths))
  assert(!ignoredPath('apps/web/src/app.ts', defaultPolicy.ignoredPaths))
  assert(!ignoredPath('src/a/b.ts', ['src/*.ts']))
  assert(ignoredPath('src/[id].ts', ['src/[id].ts']))
  assert(!ignoredPath('src/i.ts', ['src/[id].ts']))
})
test('policy mutations require explicit confirmation and bounded daily cost', () => {
  const input = { id: '00000000-0000-4000-8000-000000000001', revision: 1, settings: defaultPolicy, confirmed: true }
  savePolicySchema.parse(input)
  assert.throws(() => savePolicySchema.parse({ ...input, confirmed: false }))
  assert.throws(() => savePolicySchema.parse({ ...input, settings: { ...defaultPolicy, dailyLimit: 0 } }))
  assert.throws(() => savePolicySchema.parse({ ...input, settings: { ...defaultPolicy, visibility: 'workspace' } }))
})
