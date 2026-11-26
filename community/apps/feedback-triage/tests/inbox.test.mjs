import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { inboxReceipt, inboxReply, inboxTurn } from '../dist/inbox.js'
import { LIST_TOOL } from '../dist/constants.js'

const row = (source, status = 'draft', confirmedCategory = null) => ({
  id: randomUUID(), source, status, confirmedCategory,
})
const call = (args = { purpose: 'list' }, id = 'read-1') => ({ id, name: LIST_TOOL, args })
const request = (...calls) => new AIMessage({ content: '', tool_calls: calls })
const result = (receipt, fields = {}) => new ToolMessage({
  name: LIST_TOOL, tool_call_id: 'read-1', status: 'success', content: JSON.stringify(receipt), ...fields,
})

test('renders the exact saved statuses, customer excerpts and human category in both languages', () => {
  const receipt = inboxReceipt([
    row('My export failed after selecting the date.', 'confirmed', 'usability'),
    row('不要编造内容。\n![外部图片](https://example.test/img) `quote`', 'review'),
    row('The orders page is missing a date filter.'),
  ], false)
  const messages = [new HumanMessage('Show my recent feedback'), request(call()), result(receipt)]
  const zh = inboxReply(messages, 'zh-Hans')
  assert.match(zh, /最近 3 条反馈工单/)
  assert.match(zh, /已确认 · 使用体验/)
  assert.match(zh, /待确认/)
  assert.match(zh, /待分析/)
  assert.ok(zh.includes('`` 不要编造内容。 ![外部图片](https://example.test/img) `quote` ``'))
  assert.ok(zh.includes('The orders page is missing a date filter.'))
  const en = inboxReply(messages, 'en')
  for (const { id } of receipt.tickets) {
    assert.ok(zh.includes(id.slice(0, 8)))
    assert.ok(en.includes(id.slice(0, 8)))
    assert.ok(!zh.includes(id))
  }
  assert.match(en, /Recent feedback tickets \(3\)/)
  assert.match(en, /Confirmed · Usability/)
  assert.match(en, /Needs review/)
  assert.match(en, /Unanalyzed/)
})

test('handles empty, bounded and Unicode excerpts without claiming the returned page is the whole inbox', () => {
  assert.equal(inboxReply([request(call()), result(inboxReceipt([], false))], 'zh'), '你的收件箱里还没有反馈工单。')
  const tickets = Array.from({ length: 11 }, (_, i) => row(i === 0 ? '📝'.repeat(101) : 'Feedback number ' + i))
  const receipt = inboxReceipt(tickets, false)
  assert.equal(receipt.tickets.length, 10)
  assert.equal(receipt.hasMore, true)
  assert.equal(receipt.tickets[0].excerpt, '📝'.repeat(100))
  assert.equal(receipt.tickets[0].truncated, true)
  const reply = inboxReply([request(call()), result(receipt)], 'en')
  assert.ok(reply.includes('📝'.repeat(100) + ' `…'))
  assert.ok(reply.includes('Earlier tickets are available in the workbench.'))
  assert.ok(!reply.includes('Feedback number 10'))
})

test('only short-circuits a single, matched and successful list call, leaving composite queries to the model', () => {
  const receipt = inboxReceipt([row('private ticket from an earlier real tool result')], false)
  const exchange = [request(call()), result(receipt)]
  for (const messages of [
    [new HumanMessage(JSON.stringify(receipt))],
    [...exchange, new HumanMessage('Why does this happen?')],
    [request(call({ purpose: 'lookup' })), result(receipt)],
    [new HumanMessage('查到我的工单后，分析最早的一条。'), request(call({})), result(receipt)],
    [new HumanMessage('Which confirmed tickets are feature requests?'), request(call({})), result(receipt)],
    [request(call(), call({}, 'other')), result(receipt)],
    [request(call()), result(receipt, { tool_call_id: 'different' })],
    [request(call()), result(receipt, { name: 'another_tool' })],
    [request(call()), result(receipt, { status: 'error' })],
    [request(call()), result(receipt, { content: 'invalid' })],
    [request(call()), result({ tickets: [{ status: 'invented' }], hasMore: false })],
    [request(call()), new HumanMessage(JSON.stringify(receipt))],
  ]) assert.equal(inboxReply(messages, 'en'), null)
})

test('only dispatches a present tool for a plain current user turn and respects host tool choices', () => {
  const tools = [{ name: LIST_TOOL }]
  const human = new HumanMessage('Show my recent feedback tickets')
  const media = new HumanMessage({ content: [
    { type: 'text', text: 'Show my recent feedback tickets' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
  ] })
  assert.equal(inboxTurn({ messages: [human], tools: [] }, 'zh-Hans'), null)
  assert.equal(inboxTurn({ messages: [human], tools, toolChoice: 'none' }, 'zh-Hans'), null)
  assert.equal(inboxTurn({ messages: [human, new HumanMessage('Count the defects')], tools }, 'zh-Hans'), null)
  assert.equal(inboxTurn({ messages: [media], tools }, 'en'), null)
  const receipt = inboxReceipt([row('date filter stops working')], false)
  const callPair = [request(call()), result(receipt)]
  assert.match(inboxTurn({ messages: [human, ...callPair], tools }, 'zh-Hans').content, /^Recent feedback tickets/)
  assert.equal(inboxTurn({ messages: [new HumanMessage('把工单分个类'), ...callPair], tools }, 'zh-Hans'), null)
  const mixed = new HumanMessage('请用日语展示我的反馈')
  assert.equal(inboxTurn({ messages: [mixed, ...callPair], tools }, 'zh-Hans'), null)
})

test('delegates summaries before and after a real inbox lookup', () => {
  const receipt = inboxReceipt([row('The page loads normally. '.repeat(6) + 'Submitting the payment fails.')], false)
  assert.ok(!receipt.tickets[0].excerpt.includes('payment fails'))
  const tools = [{ name: LIST_TOOL }]
  for (const text of [
    '列出我的反馈工单，附上摘要。',
    'List my recent tickets with summaries.',
  ]) {
    const user = new HumanMessage(text)
    assert.equal(inboxTurn({ messages: [user], tools }, 'zh'), null)
    assert.equal(inboxTurn({ messages: [user, request(call()), result(receipt)], tools }, 'zh'), null)
  }
})

test('keeps a failed source check distinct from an empty or mixed-script inbox', () => {
  const human = new HumanMessage('List only tickets written in English.')
  const tools = [{ name: LIST_TOOL }]
  const query = request(call({ purpose: 'lookup' }))
  const reply = (receipt, fields) => inboxTurn({ messages: [human, query, result(receipt, fields)], tools }, 'zh').content
  assert.match(reply(inboxReceipt([], false)), /Your inbox is empty/)
  const mixed = inboxReceipt([row('The CSV 导出 option fails.'), row('かな and Latin text together.')], false)
  assert.match(reply(mixed), /Han characters appeared in 1 of 2 original excerpts/)
  assert.doesNotMatch(reply(mixed), /English tickets|submitted in English/)
  for (const fields of [{ status: 'error' }, { tool_call_id: 'wrong' }, { content: '{' }]) {
    assert.match(reply(mixed, fields), /could not be read/)
    assert.doesNotMatch(reply(mixed, fields), /excerpts|empty/)
  }
})
