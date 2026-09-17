/**
 * Behaviour tests for the conversation ingestion adapters and the import step.
 *
 * These cover the two things an importer is actually judged on: whether it survives the messy
 * shapes real exports have, and whether importing the same file twice doubles the business data.
 *
 *   node --test tests/conversation-import.test.mjs
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const { parseConversations, detectImportFormat } = require('../dist/lib/conversation-import.js')
const { ConversationReviewService } = require('../dist/lib/conversation-review.service.js')

const SCOPE = { tenantId: 't1', organizationId: 'o1', userId: 'seller-a', assistantId: 'x1' }
const OTHER_SELLER = { tenantId: 't1', organizationId: 'o1', userId: 'seller-b', assistantId: 'x1' }

class FakeRepository {
  constructor() {
    this.rows = []
  }
  create(input) {
    return { ...input }
  }
  async save(entity) {
    if (!entity.id) {
      entity.id = randomUUID()
      entity.createdAt = new Date()
      this.rows.push(entity)
    }
    entity.updatedAt = new Date()
    return entity
  }
  async find({ where } = {}) {
    return this.rows.filter((row) => matches(row, where))
  }
  async findOne({ where } = {}) {
    return this.rows.find((row) => matches(row, where)) ?? null
  }
}

function matches(row, where) {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => value === undefined || row[key] === value)
}

function newService() {
  const repository = new FakeRepository()
  return { service: new ConversationReviewService(repository), repository }
}

describe('format detection', () => {
  it('maps file extensions onto adapters', () => {
    assert.equal(detectImportFormat('export.json'), 'json')
    assert.equal(detectImportFormat('会话导出.CSV'), 'csv')
    assert.equal(detectImportFormat('dump.tsv'), 'csv')
    assert.equal(detectImportFormat('sheet.xlsx'), undefined, 'xlsx is not supported yet, and says so')
    assert.equal(detectImportFormat(undefined), undefined)
  })
})

describe('json adapter', () => {
  it('reads a bare array', () => {
    const { rows, skipped } = parseConversations(
      JSON.stringify([{ customerName: '华东制造', conversation: '销售：您好。客户：价格太贵。' }]),
      'json'
    )
    assert.equal(skipped.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].customerName, '华东制造')
  })

  it('reads an API-shaped envelope', () => {
    const payload = { errcode: 0, records: [{ customer: '华南贸易', content: '客户问交付周期。' }] }
    const { rows } = parseConversations(JSON.stringify(payload), 'json')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].customerName, '华南贸易')
    assert.equal(rows[0].conversation, '客户问交付周期。')
  })

  it('flattens a messages array into a plain transcript', () => {
    const payload = [
      {
        客户名称: '华东制造',
        messages: [
          { speaker: '销售', text: '王总您好。' },
          { role: '客户', content: '价格太贵了。' },
          { speaker: '销售', text: '' },
          '客户：再考虑一下。'
        ]
      }
    ]
    const { rows } = parseConversations(JSON.stringify(payload), 'json')
    assert.equal(rows[0].conversation, '销售：王总您好。\n客户：价格太贵了。\n客户：再考虑一下。')
  })

  it('reads timestamps in the forms exports actually use', () => {
    const payload = [
      { customerName: 'A', conversation: 'x', occurredAt: '2026-09-12T10:00:00Z' },
      { customerName: 'B', conversation: 'x', time: 1757673600 },
      { customerName: 'C', conversation: 'x', 沟通时间: '2026-09-12 14:30' },
      { customerName: 'D', conversation: 'x', occurredAt: '昨天下午' }
    ]
    const { rows } = parseConversations(JSON.stringify(payload), 'json')
    assert.ok(rows[0].occurredAt instanceof Date)
    assert.equal(rows[0].occurredAt.toISOString(), '2026-09-12T10:00:00.000Z')
    assert.ok(rows[1].occurredAt instanceof Date, 'epoch seconds are widened to milliseconds')
    assert.equal(rows[1].occurredAt.getFullYear(), 2025)
    assert.ok(rows[2].occurredAt instanceof Date, 'a spreadsheet datetime without the T still parses')
    assert.equal(rows[3].occurredAt, undefined, 'an unreadable timestamp drops the date, not the conversation')
    assert.equal(rows[3].customerName, 'D')
  })

  it('reports an unmappable entry instead of dropping it silently', () => {
    const { rows, skipped } = parseConversations(
      JSON.stringify([{ customerName: 'A', conversation: 'x' }, { foo: 'bar' }, 42]),
      'json'
    )
    assert.equal(rows.length, 1)
    assert.equal(skipped.length, 2)
    assert.equal(skipped[0].row, 2)
    assert.match(skipped[0].reason, /foo/, 'the reason names the keys that were there, to help fix the export')
    assert.equal(skipped[1].row, 3)
  })

  it('rejects a payload whose shape cannot be found at all', () => {
    assert.throws(() => parseConversations('{"nope":1}', 'json'), /无法识别/)
    assert.throws(() => parseConversations('not json', 'json'), /JSON 解析失败/)
    assert.throws(() => parseConversations('   ', 'json'), /空的/)
  })

  it('reads the customer id, distinct from the conversation externalId', () => {
    const payload = [
      { customerName: '华东精密制造', conversation: 'x', id: 'wecom-001', customerId: 'CRM-EAST-1001' },
      { 客户名称: '华东精密制造', 内容: 'y', 客户编号: 'CRM-EAST-9001' }
    ]
    const { rows } = parseConversations(JSON.stringify(payload), 'json')
    assert.equal(rows[0].externalId, 'wecom-001')
    assert.equal(rows[0].customerExternalId, 'CRM-EAST-1001')
    assert.equal(rows[1].customerExternalId, 'CRM-EAST-9001', 'Chinese alias 客户编号 is recognised too')
  })
})

describe('csv adapter', () => {
  it('keeps a conversation containing commas, quotes and line breaks in one cell', () => {
    const csv = [
      'customerName,conversation,externalId',
      '华东制造,"销售：您好，王总。',
      '客户：你们报价比另一家高不少，而且我说过""年底必须上线""。',
      '销售：我回头发您方案。",wecom-001'
    ].join('\n')

    const { rows, skipped } = parseConversations(csv, 'csv')
    assert.equal(skipped.length, 0)
    assert.equal(rows.length, 1, 'the embedded newlines are part of the field, not row separators')
    assert.equal(rows[0].customerName, '华东制造')
    assert.equal(rows[0].externalId, 'wecom-001')
    assert.match(rows[0].conversation, /年底必须上线/)
    assert.ok(rows[0].conversation.includes('"年底必须上线"'), 'doubled quotes unescape to one')
    assert.equal(rows[0].conversation.split('\n').length, 3)
  })

  it('accepts Chinese headers, a BOM and CRLF', () => {
    const csv = '﻿客户名称,沟通记录\r\n华南贸易,客户关心价格。\r\n'
    const { rows } = parseConversations(csv, 'csv')
    assert.equal(rows.length, 1, 'the trailing CRLF is not an empty row')
    assert.equal(rows[0].customerName, '华南贸易')
    assert.equal(rows[0].conversation, '客户关心价格。')
  })

  it('sniffs a tab-separated export', () => {
    const { rows } = parseConversations('customerName\tconversation\n华东制造\t客户问交付。', 'csv')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].conversation, '客户问交付。')
  })

  it('names the headers it found when the required columns are missing', () => {
    assert.throws(() => parseConversations('name,notes\na,b', 'csv'), /当前表头：name \| notes/)
  })

  it('reports a blank row by its position in the file', () => {
    const csv = ['customerName,conversation', '华东制造,客户问交付。', ',', '华南贸易,客户关心价格。'].join('\n')
    const { rows, skipped } = parseConversations(csv, 'csv')
    assert.equal(rows.length, 2)
    assert.equal(skipped.length, 0, 'a row of only empty cells is whitespace, not a user error')
  })

  it('reads a 客户编号 column into customerExternalId', () => {
    const csv = ['客户名称,沟通记录,客户编号', '华东精密制造,客户问交付。,CRM-EAST-9001'].join('\n')
    const { rows } = parseConversations(csv, 'csv')
    assert.equal(rows[0].customerExternalId, 'CRM-EAST-9001')
  })
})

describe('importing into the workbench', () => {
  const ROWS = [
    { customerName: '华东制造', conversation: '销售：您好。客户：价格太贵。', externalId: 'wecom-001' },
    { customerName: '华南贸易', conversation: '客户问交付周期。', externalId: 'wecom-002' }
  ]

  it('lands every row as a draft owned by the importing seller', async () => {
    const { service, repository } = newService()
    const result = await service.importConversations(SCOPE, ROWS, 'import:json')

    assert.equal(result.imported, 2)
    assert.equal(result.duplicates, 0)
    assert.deepEqual(result.skipped, [])
    assert.equal(repository.rows.length, 2)
    assert.equal(repository.rows[0].status, 'draft', 'import never triggers analysis on its own')
    assert.equal(repository.rows[0].source, 'import:json')
    assert.equal(repository.rows[0].createdById, 'seller-a')
  })

  it('re-importing the same file adds nothing', async () => {
    const { service, repository } = newService()
    await service.importConversations(SCOPE, ROWS, 'import:json')
    const second = await service.importConversations(SCOPE, ROWS, 'import:json')

    assert.equal(second.imported, 0)
    assert.equal(second.duplicates, 2)
    assert.equal(repository.rows.length, 2, 'still exactly two business records')
  })

  it('deduplicates within a single file too', async () => {
    const { service, repository } = newService()
    const result = await service.importConversations(SCOPE, [ROWS[0], ROWS[0], ROWS[1]], 'import:csv')

    assert.equal(result.imported, 2)
    assert.equal(result.duplicates, 1)
    assert.equal(repository.rows.length, 2)
  })

  it('imports rows without an externalId every time, and says so by not counting them as duplicates', async () => {
    const { service } = newService()
    const anonymous = [{ customerName: '华东制造', conversation: '客户问交付。' }]
    await service.importConversations(SCOPE, anonymous, 'import:csv')
    const second = await service.importConversations(SCOPE, anonymous, 'import:csv')

    assert.equal(second.imported, 1, 'without a source id there is nothing to deduplicate against')
    assert.equal(second.duplicates, 0)
  })

  it('another seller importing the same export gets their own records', async () => {
    const { service, repository } = newService()
    await service.importConversations(SCOPE, ROWS, 'import:json')
    const theirs = await service.importConversations(OTHER_SELLER, ROWS, 'import:json')

    assert.equal(theirs.imported, 2, 'externalId is unique per seller, not globally')
    assert.equal(repository.rows.length, 4)
    assert.equal((await service.getViewData(SCOPE)).total, 2)
    assert.equal((await service.getViewData(OTHER_SELLER)).total, 2)
  })

  it('keeps the good rows and reports the bad ones with a reason', async () => {
    const { service } = newService()
    const result = await service.importConversations(
      SCOPE,
      [
        { customerName: '华东制造', conversation: '客户问交付。' },
        { customerName: '   ', conversation: '没有客户名' },
        { customerName: '华南贸易', conversation: '' },
        { customerName: '过长客户', conversation: 'x'.repeat(8001) }
      ],
      'import:csv'
    )

    assert.equal(result.imported, 1, 'one bad row does not reject the file')
    assert.equal(result.skipped.length, 3)
    assert.equal(result.skipped[0].row, 2)
    assert.match(result.skipped[0].reason, /客户名称不能为空/)
    assert.match(result.skipped[1].reason, /沟通记录不能为空/)
    assert.match(result.skipped[2].reason, /不能超过 8000/)
    assert.equal(result.skipped[2].customerName, '过长客户')
  })

  it('carries the parser own skipped rows through to the same report', async () => {
    const { service } = newService()
    const result = await service.importConversations(SCOPE, [ROWS[0]], 'import:json', [
      { row: 7, reason: '不是一个对象' }
    ])
    assert.equal(result.imported, 1)
    assert.deepEqual(result.skipped, [{ row: 7, reason: '不是一个对象' }])
  })

  it('refuses a batch larger than the cap rather than half-importing it', async () => {
    const { service, repository } = newService()
    const many = Array.from({ length: 201 }, (_, index) => ({
      customerName: `客户${index}`,
      conversation: '客户问交付。'
    }))
    await assert.rejects(() => service.importConversations(SCOPE, many, 'import:csv'), /最多导入 200 条/)
    assert.equal(repository.rows.length, 0, 'nothing is written when the batch is rejected')
  })

  it('rejects a file with nothing in it', async () => {
    const { service } = newService()
    await assert.rejects(() => service.importConversations(SCOPE, [], 'import:json'), /没有可识别的沟通记录/)
  })
})

describe('the pending-analysis queue', () => {
  it('queues drafts and failures oldest conversation first', async () => {
    const { service } = newService()
    await service.importConversations(
      SCOPE,
      [
        { customerName: '较新', conversation: 'x', occurredAt: new Date(2026, 8, 14) },
        { customerName: '最早', conversation: 'x', occurredAt: new Date(2026, 8, 1) },
        { customerName: '居中', conversation: 'x', occurredAt: new Date(2026, 8, 8) }
      ],
      'import:json'
    )

    const queue = await service.listPendingAnalysis(SCOPE)
    assert.deepEqual(
      queue.map((item) => item.customerName),
      ['最早', '居中', '较新'],
      'a customer history only makes sense if their conversations are analysed in order'
    )
  })

  it('includes failed records so a batch re-run picks them up', async () => {
    const { service } = newService()
    const { recordIds } = await service.importConversations(
      SCOPE,
      [{ customerName: 'A', conversation: 'x' }, { customerName: 'B', conversation: 'x' }],
      'import:json'
    )
    await service.requestAnalysis(SCOPE, recordIds[0])
    await service.markFailed(SCOPE, recordIds[0], '模型调用失败')

    const queue = await service.listPendingAnalysis(SCOPE)
    assert.equal(queue.length, 2)
    assert.ok(queue.some((item) => item.status === 'failed'))
  })

  it('drops a record out of the queue once it is analysed', async () => {
    const { service } = newService()
    const { recordIds } = await service.importConversations(SCOPE, [{ customerName: 'A', conversation: 'x' }], 'import:json')
    await service.requestAnalysis(SCOPE, recordIds[0])
    await service.saveAiResult(SCOPE, { recordId: recordIds[0], summary: '摘要' })

    assert.deepEqual(await service.listPendingAnalysis(SCOPE), [])
  })

  it('caps the queue and never shows another seller work', async () => {
    const { service } = newService()
    const many = Array.from({ length: 25 }, (_, index) => ({ customerName: `客户${index}`, conversation: 'x' }))
    await service.importConversations(SCOPE, many, 'import:csv')
    await service.importConversations(OTHER_SELLER, [{ customerName: '别人的', conversation: 'x' }], 'import:csv')

    assert.equal((await service.listPendingAnalysis(SCOPE)).length, 20)
    assert.equal((await service.listPendingAnalysis(SCOPE, 5)).length, 5)
    const theirs = await service.listPendingAnalysis(OTHER_SELLER)
    assert.equal(theirs.length, 1)
    assert.equal(theirs[0].customerName, '别人的')
  })
})

describe('the trend describes sales activity, not import activity', () => {
  it('buckets an imported back-catalogue by when each conversation happened', async () => {
    const { service } = newService()
    const today = new Date()
    const daysAgo = (days) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days)

    await service.importConversations(
      SCOPE,
      [
        { customerName: 'A', conversation: 'x', occurredAt: daysAgo(10) },
        { customerName: 'B', conversation: 'x', occurredAt: daysAgo(10) },
        { customerName: 'C', conversation: 'x', occurredAt: daysAgo(3) }
      ],
      'import:json'
    )

    const { trend } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(trend[trend.length - 1].count, 0, 'nothing happened today; the import did')
    assert.equal(trend[trend.length - 11].count, 2)
    assert.equal(trend[trend.length - 4].count, 1)
  })

  it('falls back to the filing date when the source reported no time', async () => {
    const { service } = newService()
    await service.importConversations(SCOPE, [{ customerName: 'A', conversation: 'x' }], 'import:csv')

    const { trend } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(trend[trend.length - 1].count, 1)
  })
})
