import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import preview from '../remote-components/workbench/preview.config.mjs'

const sourceText = '00:12 用户：需要按项目筛选需求。'

test('production preview covers failed, stale, successful and empty source revisions', async () => {
  const state = structuredClone(preview.state)
  const context = { state, events: [] }
  const execute = (actionKey, input) =>
    preview.handleRequest(
      { type: 'executeAction', actionKey, input },
      context
    )

  const created = await execute('create', {
    title: '修改原文预览',
    sourceText
  })
  const reviewId = created.result.data.reviewId
  const review = state.reviews[0]

  const first = await execute('start', {
    reviewId,
    expectedVersion: review.version,
    requestKey: randomUUID()
  })
  await preview.handleRequest(
    {
      type: 'invokeClientCommand',
      commandKey: first.result.data.clientCommand.commandKey
    },
    context
  )
  assert.equal(review.status, 'FAILED')

  const stale = await execute('revise', {
    reviewId,
    expectedVersion: review.version,
    title: '不应覆盖',
    sourceText: '不应覆盖'
  })
  assert.equal(stale.result.success, false)
  assert.equal(stale.result.data.code, 'version_conflict')
  assert.match(review.title, /已在其他页面更新/)

  const revised = await execute('revise', {
    reviewId,
    expectedVersion: review.version,
    title: '失败后修订',
    sourceText: `${sourceText}\n00:24 用户：需要展示证据。`
  })
  assert.equal(revised.result.success, true)
  assert.equal(review.status, 'READY')
  assert.equal(review.inputVersion, 2)
  assert.equal(review.aiDraft, null)
  assert.equal(review.editableDraft, null)

  const emptyAttempt = await execute('start', {
    reviewId,
    expectedVersion: review.version,
    requestKey: randomUUID()
  })
  await preview.handleRequest(
    {
      type: 'invokeClientCommand',
      commandKey: emptyAttempt.result.data.clientCommand.commandKey
    },
    context
  )
  assert.equal(review.status, 'EMPTY')

  const revisedEmpty = await execute('revise', {
    reviewId,
    expectedVersion: review.version,
    title: '空结果后修订',
    sourceText
  })
  assert.equal(revisedEmpty.result.success, true)
  assert.equal(review.status, 'READY')
  assert.equal(review.inputVersion, 3)
})
