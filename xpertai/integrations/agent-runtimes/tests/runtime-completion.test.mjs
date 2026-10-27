import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runnerCompletion } from '../dist/lib/runtime-completion.js'
import { target, supervisedReceipt, exitEvidence } from './completion-fixture.mjs'
const receipt = supervisedReceipt({ tool: { id: 'codex' } })
const handle = { sessionId: 'session', runId: 'turn', runner: receipt }
const context = { invocationId: 'invocation', executionTarget: target }
test('completion binds original invocation, process, environment, container generation and supervision contract', () => {
  assert.equal(runnerCompletion(context, handle, 'cancelled', exitEvidence(receipt)).state, 'settled')
  for (const completion of [
    undefined,
    { ...exitEvidence(receipt), invocationId: 'other' },
    { ...exitEvidence(receipt), processId: 'reused' },
    { ...exitEvidence(receipt), coverage: 'parent' },
    { ...exitEvidence(receipt), environment: { ...receipt.environment, instanceId: 'new-container' } }
  ])
    assert.equal(runnerCompletion(context, handle, 'cancelled', completion), undefined)
  assert.equal(
    runnerCompletion(
      context,
      { ...handle, runner: { ...receipt, supervision: undefined } },
      'cancelled',
      exitEvidence(receipt)
    ),
    undefined
  )
  assert.equal(
    runnerCompletion({ ...context, executionTarget: undefined }, handle, 'cancelled', exitEvidence(receipt)),
    undefined
  )
})
