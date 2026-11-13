import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
const require = createRequire(import.meta.url)
require('reflect-metadata')
const { PaymentViewProvider } = require('../dist/lib/payment-view.provider.js')
const { PROVIDER, VIEW } = require('../dist/lib/constants.js')

test('view local key and template public key follow the platform namespace contract', () => {
  const provider = new PaymentViewProvider({})
  const manifests = provider.getViewManifests({ hostType: 'agent' }, 'agent.workbench.fixed')
  assert.equal(manifests.length, 1)
  assert.equal(manifests[0].key, VIEW)
  assert.ok(!VIEW.includes('__'), 'local manifest keys must not contain the public-key separator')
  assert.ok(!PROVIDER.includes('__'))
  const template = parse(readFileSync(new URL('../src/assistant.yaml', import.meta.url), 'utf8'))
  assert.equal(template.team.options.workbench.defaultViewKey, `${PROVIDER}__${VIEW}`)
})

test('valid turn context survives an unrelated or incomplete alternative runtime container', () => {
  const { resolvePaymentContext } = require('../dist/lib/payment.middleware.js')
  const selected = {recordId:'11111111-1111-4111-8111-111111111111',attemptId:'22222222-2222-4222-8222-222222222222'}
  assert.deepEqual(resolvePaymentContext({context:{paymentFollowup:selected},configurable:{context:{env:{}}}}),selected)
  assert.deepEqual(resolvePaymentContext({context:{env:{}},configurable:{context:{paymentFollowup:selected}}}),selected)
  assert.equal(resolvePaymentContext({context:{paymentFollowup:{...selected,attemptId:'invalid'}}}),undefined)
})
