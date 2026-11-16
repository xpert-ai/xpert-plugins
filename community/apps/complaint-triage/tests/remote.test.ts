import assert from 'node:assert/strict'
import test from 'node:test'
import { FAILURE_CODES, ERROR_CODES, TICKET_STATUSES, ATTEMPT_STATUSES } from '../src/lib/domain/contracts.js'
import { CATEGORIES, CHANNELS, SENTIMENTS, SEVERITIES } from '../src/lib/domain/policy.js'
import { normalizeHostEvent } from '../src/lib/remote/bridge.js'
import { catalogs, createTranslator, isMessageKey, resolveLocale } from '../src/lib/remote/i18n.js'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

test('both catalogs define the same keys with the same placeholders', () => {
  const zh = catalogs['zh-Hans']
  const en = catalogs['en-US']
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
    assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), `placeholders differ for ${key}`)
  }
})

test('every code the server can return has a localized label', () => {
  const expected = [
    ...TICKET_STATUSES.map((value) => `status.${value}`),
    ...ATTEMPT_STATUSES.map((value) => `attempt.${value}`),
    ...FAILURE_CODES.map((value) => `failure.${value}`),
    ...ERROR_CODES.map((value) => `error.${value}`),
    ...CATEGORIES.map((value) => `category.${value}`),
    ...SEVERITIES.map((value) => `severity.${value}`),
    ...SENTIMENTS.map((value) => `sentiment.${value}`),
    ...CHANNELS.map((value) => `channel.${value}`)
  ]
  assert.deepEqual(expected.filter((key) => !isMessageKey(key)), [])
})

test('locale resolution keeps Traditional Chinese out of the Simplified catalog', () => {
  assert.deepEqual(['zh-Hans', 'zh_CN', 'zh', 'zh-Hans-CN'].map(resolveLocale), ['zh-Hans', 'zh-Hans', 'zh-Hans', 'zh-Hans'])
  assert.deepEqual(['zh-Hant', 'zh-TW', 'en', 'fr-FR', ''].map(resolveLocale), ['en-US', 'en-US', 'en-US', 'en-US', 'en-US'])
  assert.equal(createTranslator('zh-Hans')('prompt.analyze', { ticketNo: 'TCK-1' }), '请分析客诉工单 TCK-1')
  assert.equal(createTranslator('en-US')('list.attempts', {}), '{count} analyses', 'a missing parameter stays visible instead of becoming "undefined"')
})

test('host tool events are recognized in every envelope shape the platform uses', () => {
  assert.deepEqual(normalizeHostEvent({ type: 'assistant.tool.completed', toolName: 'complaint_save_analysis' }), {
    type: 'assistant.tool.completed',
    toolName: 'complaint_save_analysis'
  })
  assert.equal(normalizeHostEvent({ type: 'assistant.tool.completed', data: { toolName: 'complaint_get_ticket' } }).toolName, 'complaint_get_ticket')
  assert.equal(normalizeHostEvent({ data: { toolCall: { name: 'complaint_report_failure' } } }).toolName, 'complaint_report_failure')
  assert.equal(normalizeHostEvent({ data: { tool_call: { name: 'x' } } }).toolName, 'x')
  assert.deepEqual(normalizeHostEvent(null), { type: 'unknown', toolName: null })
  assert.deepEqual(normalizeHostEvent('garbage'), { type: 'unknown', toolName: null })
})
