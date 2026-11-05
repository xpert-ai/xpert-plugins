import assert from 'node:assert/strict'
import test from 'node:test'
import { assertConfirmable, evaluateDraft, matchesScope } from './rules.ts'

const complete = {
  rawText: '订单 SO-10086 物流延误三天，联系人李敏 13800001111，希望今天发出或赔偿运费。',
  category: 'logistics' as const,
  urgency: 'normal' as const,
  customerDemand: '尽快发出或赔偿运费',
  suggestedReply: '已登记物流延误，我们会核实后回复处理方案，赔偿需人工确认。',
  orderNo: 'SO-10086',
  contact: '13800001111'
}

test('short text stays correctable and cannot be confirmed', () => {
  const result = evaluateDraft({ rawText: '你们太差了' })
  assert.equal(result.status, 'draft')
  assert.match(result.validationErrors[0], /过短/)
  assert.throws(() => assertConfirmable(result.status, result.missingFields), /草稿/)
})

test('missing order or contact becomes needs_info', () => {
  const result = evaluateDraft({ ...complete, orderNo: undefined, contact: undefined })
  assert.equal(result.status, 'needs_info')
  assert.ok(result.missingFields.includes('订单号'))
  assert.ok(result.missingFields.includes('联系方式'))
  assert.throws(() => assertConfirmable(result.status, result.missingFields), /缺少/)
})

test('model failure keeps the same case confirmable count at zero', () => {
  const failed = evaluateDraft({
    ...complete,
    simulateModelFailure: true,
    failureReason: '模型超时'
  })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.failureReason, '模型超时')
  assert.throws(() => assertConfirmable(failed.status, []), /重试/)

  const retried = evaluateDraft(complete)
  assert.equal(retried.status, 'ready')
  assert.equal(retried.validationErrors.length, 0)
})

test('unparseable model output is a failure instead of a confirmable draft', () => {
  const result = evaluateDraft({ rawText: complete.rawText, category: undefined, customerDemand: undefined })
  assert.equal(result.status, 'failed')
  assert.match(result.failureReason ?? '', /无法解析/)
})

test('regulator language marks escalation and a complete draft can be confirmed once', () => {
  const result = evaluateDraft({
    ...complete,
    rawText: `${complete.rawText} 我已经多次投诉，准备向监管部门反映。`
  })
  assert.equal(result.escalationSuggested, true)
  assert.equal(result.status, 'ready')
  assert.doesNotThrow(() => assertConfirmable(result.status, result.missingFields))
  assert.doesNotThrow(() => assertConfirmable('confirmed', []))
})

test('records outside the current tenant or organization do not match', () => {
  assert.equal(matchesScope({ tenantId: 't1', organizationId: 'o1' }, { tenantId: 't1', organizationId: 'o1' }), true)
  assert.equal(matchesScope({ tenantId: 't1', organizationId: 'o1' }, { tenantId: 't2', organizationId: 'o1' }), false)
  assert.equal(matchesScope({ tenantId: 't1', organizationId: 'o1' }, { tenantId: 't1', organizationId: 'o2' }), false)
})
