/**
 * Business-behaviour tests for ConversationReviewService.
 *
 * These run against the built `dist` output with an in-memory repository double, so they
 * assert business results (status transitions, retry semantics, scope isolation, validation)
 * rather than merely that a function was called. They do NOT prove anything about the real
 * database, the platform, or the assistant — that is covered by the platform acceptance runs
 * documented in the README.
 *
 *   node --test tests/conversation-review.service.test.mjs
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const { ConversationReviewService } = require('../dist/lib/conversation-review.service.js')
const { RULE_VERSION, getRuleDisclosure } = require('../dist/lib/rule-check.js')

const SCOPE = { tenantId: 't1', organizationId: 'o1', userId: 'seller-a', assistantId: 'x1' }
const OTHER_SELLER = { tenantId: 't1', organizationId: 'o1', userId: 'seller-b', assistantId: 'x1' }

/** Minimal in-memory stand-in for the TypeORM repository surface the service uses. */
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

  async find({ where, order } = {}) {
    let rows = this.rows.filter((row) => matches(row, where))
    if (order && order.updatedAt) {
      rows = [...rows].sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
    }
    return rows
  }

  async findOne({ where } = {}) {
    return this.rows.find((row) => matches(row, where)) ?? null
  }
}

function matches(row, where) {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => value === undefined || row[key] === value)
}

const VALID_SCORES = {
  needDiscovery: 70,
  budgetHandling: 45,
  decisionMapping: 30,
  objectionHandling: 55,
  nextStepClarity: 60,
  complianceRisk: 20
}

const VALID_ANALYSIS = {
  intentLevel: 'high',
  summary: '客户关注价格和年底上线时间，计划先上 50 个账号。',
  scores: VALID_SCORES,
  requirements: ['50 个账号试点', '与现有 ERP 对接'],
  concerns: [
    { category: 'price', severity: 'high', detail: '价格高于竞品', evidence: '你们报的比另一家高不少' },
    { category: 'delivery', severity: 'high', detail: '年底前必须上线', evidence: '我们年底前必须上线' }
  ],
  risks: [
    {
      category: 'unconfirmed_delivery',
      severity: 'high',
      detail: '口头承诺一周部署完成，未经确认',
      evidence: '年底上线肯定没问题，我们一周就能部署完'
    }
  ],
  missingInformation: ['ERP 的具体版本与接口方式'],
  nextActions: ['本周内发送 ERP 对接方案', '向上申请折扣并书面回复客户']
}

function newService() {
  const repository = new FakeRepository()
  return { service: new ConversationReviewService(repository), repository }
}

async function seedRecord(service, overrides = {}) {
  return service.createRecord(SCOPE, {
    customerName: '示例客户',
    conversation: '销售：您好。客户：价格太贵了，能便宜点吗？',
    ...overrides
  })
}

describe('createRecord', () => {
  it('stores a draft with the owning seller and zeroed counters', async () => {
    const { service, repository } = newService()
    const record = await seedRecord(service)

    assert.equal(record.status, 'draft')
    assert.equal(record.createdById, 'seller-a')
    assert.equal(record.tenantId, 't1')
    assert.equal(record.retryCount, 0)
    assert.equal(record.revision, 0)
    assert.equal(repository.rows.length, 1)
  })

  it('rejects a missing customer name', async () => {
    const { service } = newService()
    await assert.rejects(() => seedRecord(service, { customerName: '   ' }), /客户名称不能为空/)
  })

  it('rejects a missing conversation', async () => {
    const { service } = newService()
    await assert.rejects(() => seedRecord(service, { conversation: '' }), /沟通记录不能为空/)
  })

  it('rejects a conversation beyond the length limit', async () => {
    const { service } = newService()
    await assert.rejects(() => seedRecord(service, { conversation: 'x'.repeat(8001) }), /不能超过 8000/)
  })
})

describe('analysis lifecycle', () => {
  it('moves draft -> processing -> completed and keeps the AI result', async () => {
    const { service } = newService()
    const record = await seedRecord(service)

    const { record: processing } = await service.requestAnalysis(SCOPE, record.id)
    assert.equal(processing.status, 'processing')
    assert.equal(processing.retryCount, 0, 'a first run is not a retry')

    const completed = await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })
    assert.equal(completed.status, 'completed')
    assert.equal(completed.intentLevel, 'high')
    assert.deepEqual(completed.aiResult.nextActions, VALID_ANALYSIS.nextActions)
    assert.ok(completed.analyzedAt instanceof Date)
  })

  it('refuses an analysis with neither a summary nor next actions', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    await assert.rejects(
      () => service.saveAiResult(SCOPE, { recordId: record.id, intentLevel: 'unknown' }),
      /至少需要包含沟通摘要或下一步跟进建议/
    )
  })

  it('drops empty strings out of list fields', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    const completed = await service.saveAiResult(SCOPE, {
      recordId: record.id,
      summary: '摘要',
      requirements: ['  需求 A  ', '   ', ''],
      concerns: []
    })
    assert.deepEqual(completed.aiResult.requirements, ['需求 A'])
    assert.equal(completed.aiResult.concerns, undefined)
  })

  it('will not start a second analysis while one is already running', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    await assert.rejects(() => service.requestAnalysis(SCOPE, record.id), /正在分析中/)
  })

  it('stamps the record with the rule version in effect when the analysis was saved', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    assert.equal(record.ruleVersion, undefined, 'a draft has never been analysed')

    await service.requestAnalysis(SCOPE, record.id)
    const completed = await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })
    assert.equal(completed.ruleVersion, RULE_VERSION)

    const { item } = await service.getViewData(SCOPE, { recordId: record.id })
    assert.equal(item.ruleVersion, RULE_VERSION, 'the tag must also reach the detail/list view, not just the entity')
  })
})

describe('failure and retry', () => {
  it('records a readable failure reason', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    const failed = await service.markFailed(SCOPE, record.id, '沟通内容过短，无法判断客户意向。')
    assert.equal(failed.status, 'failed')
    assert.match(failed.errorMessage, /沟通内容过短/)
  })

  it('falls back to a default reason when none is given', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    const failed = await service.markFailed(SCOPE, record.id)
    assert.match(failed.errorMessage, /可以重试/)
  })

  it('retries on the SAME record: no duplicate main record is created', async () => {
    const { service, repository } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.markFailed(SCOPE, record.id, '模型调用失败')

    const { record: retried } = await service.requestAnalysis(SCOPE, record.id, { isRetry: true })

    assert.equal(retried.id, record.id, 'retry must reuse the original record id')
    assert.equal(retried.status, 'processing')
    assert.equal(retried.retryCount, 1)
    assert.equal(retried.errorMessage, null, 'the stale failure reason is cleared')
    assert.equal(repository.rows.length, 1, 'still exactly one business record')
  })

  it('a successful retry produces one confirmed record, not two', async () => {
    const { service, repository } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.markFailed(SCOPE, record.id, '模型调用失败')
    await service.requestAnalysis(SCOPE, record.id, { isRetry: true })
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })
    const confirmed = await service.confirmResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    assert.equal(confirmed.status, 'confirmed')
    assert.equal(repository.rows.length, 1)
    assert.equal(repository.rows[0].retryCount, 1)
  })
})

describe('human confirmation', () => {
  it('keeps the confirmed result separate from the raw AI result', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    const edited = {
      ...VALID_ANALYSIS,
      intentLevel: 'medium',
      summary: '销售修改后的摘要：客户意向没有 AI 判断得那么高。'
    }
    const confirmed = await service.confirmResult(SCOPE, { recordId: record.id, ...edited })

    assert.equal(confirmed.status, 'confirmed')
    assert.equal(confirmed.confirmedResult.summary, edited.summary)
    assert.equal(confirmed.confirmedResult.intentLevel, 'medium')
    assert.equal(confirmed.aiResult.summary, VALID_ANALYSIS.summary, 'raw AI output is untouched')
    assert.equal(confirmed.aiResult.intentLevel, 'high')
    assert.ok(confirmed.confirmedAt instanceof Date)
  })

  it('cannot confirm before the AI result exists', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await assert.rejects(
      () => service.confirmResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS }),
      /只有在 AI 分析完成后才能确认/
    )
  })

  it('requires a summary before confirming', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    await assert.rejects(
      () => service.confirmResult(SCOPE, { recordId: record.id, summary: '  ' }),
      /请填写沟通摘要/
    )
  })

  it('rejects a stale revision instead of silently overwriting', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    const completed = await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    await assert.rejects(
      () => service.confirmResult(SCOPE, { recordId: record.id, expectedRevision: completed.revision - 1, ...VALID_ANALYSIS }),
      /已被其他操作更新/
    )
    const ok = await service.confirmResult(SCOPE, {
      recordId: record.id,
      expectedRevision: completed.revision,
      ...VALID_ANALYSIS
    })
    assert.equal(ok.status, 'confirmed')
  })
})

describe('scope and data range', () => {
  it('another seller in the same organization cannot read the record', async () => {
    const { service } = newService()
    const record = await seedRecord(service)

    await assert.rejects(() => service.getRecordForAgent(OTHER_SELLER, record.id), /不存在或无权访问/)
  })

  it('another seller cannot modify the record', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    await assert.rejects(
      () => service.saveAiResult(OTHER_SELLER, { recordId: record.id, ...VALID_ANALYSIS }),
      /不存在或无权访问/
    )
    await assert.rejects(() => service.markFailed(OTHER_SELLER, record.id, 'x'), /不存在或无权访问/)
  })

  it('the list view only returns the current seller records', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '甲客户' })
    await service.createRecord(OTHER_SELLER, { customerName: '乙客户', conversation: '另一位销售的记录' })

    const mine = await service.getViewData(SCOPE)
    assert.equal(mine.total, 1)
    assert.equal(mine.items[0].customerName, '甲客户')

    const theirs = await service.getViewData(OTHER_SELLER)
    assert.equal(theirs.total, 1)
    assert.equal(theirs.items[0].customerName, '乙客户')
  })

  it('rejects a blank record id', async () => {
    const { service } = newService()
    await assert.rejects(() => service.getRecordForAgent(SCOPE, '  '), /缺少业务记录 id/)
  })
})

describe('workbench view data', () => {
  it('reports an empty state with no records', async () => {
    const { service } = newService()
    const view = await service.getViewData(SCOPE)

    assert.equal(view.total, 0)
    assert.deepEqual(view.items, [])
    assert.equal(view.item, undefined)
    assert.equal(view.summary.mode, 'empty')
    assert.equal(view.summary.stats.total, 0)
  })

  it('always reports the rule version a new analysis would be stamped with, even with no records', async () => {
    const { service } = newService()
    const view = await service.getViewData(SCOPE)
    assert.equal(view.summary.currentRuleVersion, RULE_VERSION)
  })

  it('exposes the same rule catalog the rule-details modal reads, regardless of selection', async () => {
    const { service } = newService()
    const view = await service.getViewData(SCOPE)
    assert.deepEqual(view.summary.ruleCatalog, getRuleDisclosure())
  })

  it('counts each status and selects a record by default', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '甲客户' })
    await service.requestAnalysis(SCOPE, a.id)
    await service.saveAiResult(SCOPE, { recordId: a.id, ...VALID_ANALYSIS })
    await service.confirmResult(SCOPE, { recordId: a.id, ...VALID_ANALYSIS })
    await seedRecord(service, { customerName: '乙客户' })

    const view = await service.getViewData(SCOPE)
    assert.equal(view.total, 2)
    assert.equal(view.summary.stats.confirmed, 1)
    assert.equal(view.summary.stats.draft, 1)
    assert.equal(view.summary.mode, 'detail')
    assert.ok(view.item, 'a record is selected by default')
  })

  it('filters by status', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '甲客户' })
    await service.requestAnalysis(SCOPE, a.id)
    await seedRecord(service, { customerName: '乙客户' })

    const processing = await service.getViewData(SCOPE, { status: 'processing' })
    assert.equal(processing.total, 1)
    assert.equal(processing.items[0].customerName, '甲客户')
  })

  it('searches customer name and conversation text', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '华东制造', conversation: '客户问到了交付周期。' })
    await seedRecord(service, { customerName: '华南贸易', conversation: '客户关心价格。' })

    assert.equal((await service.getViewData(SCOPE, { search: '华东' })).total, 1)
    assert.equal((await service.getViewData(SCOPE, { search: '交付周期' })).total, 1)
    assert.equal((await service.getViewData(SCOPE, { search: '客户' })).total, 2)
    assert.equal((await service.getViewData(SCOPE, { search: '不存在的关键词' })).total, 0)
  })

  it('paginates and clamps the page size', async () => {
    const { service } = newService()
    for (let index = 0; index < 5; index += 1) {
      await seedRecord(service, { customerName: `客户${index}` })
    }

    const firstPage = await service.getViewData(SCOPE, { page: 1, pageSize: 2 })
    assert.equal(firstPage.total, 5)
    assert.equal(firstPage.items.length, 2)

    const thirdPage = await service.getViewData(SCOPE, { page: 3, pageSize: 2 })
    assert.equal(thirdPage.items.length, 1)

    const clamped = await service.getViewData(SCOPE, { page: 0, pageSize: 999 })
    assert.equal(clamped.page, 1)
    assert.equal(clamped.pageSize, 50)
  })

  it('shows the confirmed summary in the list once confirmed', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })
    await service.confirmResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS, summary: '销售确认后的摘要' })

    const view = await service.getViewData(SCOPE)
    assert.equal(view.items[0].summary, '销售确认后的摘要')
  })
})

describe('issue classification', () => {
  it('keeps a valid category and severity as given', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    const completed = await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })
    assert.deepEqual(completed.aiResult.concerns[0], {
      category: 'price',
      severity: 'high',
      detail: '价格高于竞品',
      evidence: '你们报的比另一家高不少',
      source: 'model'
    })
    assert.equal(completed.aiResult.risks[0].category, 'unconfirmed_delivery')
  })

  it('maps a category outside the vocabulary onto other instead of dropping the text', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    const completed = await service.saveAiResult(SCOPE, {
      recordId: record.id,
      summary: '摘要',
      concerns: [{ category: '客户觉得太贵', severity: 'critical', detail: '价格顾虑', evidence: '太贵了' }]
    })
    assert.equal(completed.aiResult.concerns[0].category, 'other', 'unknown category falls back')
    assert.equal(completed.aiResult.concerns[0].severity, 'medium', 'unknown severity falls back')
    assert.equal(completed.aiResult.concerns[0].detail, '价格顾虑', 'the salesperson-readable text survives')
  })

  it('accepts a concern category only in its own taxonomy', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    // `price` is a customer concern, not a wording risk — it must not be accepted as a risk.
    const completed = await service.saveAiResult(SCOPE, {
      recordId: record.id,
      summary: '摘要',
      risks: [{ category: 'price', severity: 'low', detail: 'x', evidence: 'y' }]
    })
    assert.equal(completed.aiResult.risks[0].category, 'other')
  })

  it('reads a legacy free-text row as an other-category issue', async () => {
    const { service, repository } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    // Simulate a row written before the taxonomy existed.
    repository.rows[0].aiResult.concerns = ['价格偏高']

    const view = await service.getViewData(SCOPE, { recordId: record.id })
    assert.equal(view.item.aiResult.concerns.length, 1)
    assert.equal(view.item.aiResult.concerns[0].category, 'other')
    assert.equal(view.item.aiResult.concerns[0].severity, 'medium')
    assert.equal(view.item.aiResult.concerns[0].detail, '价格偏高')
  })

  it('drops an issue that has neither detail nor evidence', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)

    const completed = await service.saveAiResult(SCOPE, {
      recordId: record.id,
      summary: '摘要',
      concerns: [{ category: 'price', severity: 'high', detail: '   ', evidence: '' }]
    })
    assert.equal(completed.aiResult.concerns, undefined)
  })
})

describe('dashboard insights', () => {
  async function seedAnalyzed(service, customerName, analysis) {
    const record = await seedRecord(service, { customerName })
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...analysis })
    return record
  }

  it('aggregates issue categories across conversations, not per record', async () => {
    const { service } = newService()
    await seedAnalyzed(service, '甲客户', VALID_ANALYSIS)
    await seedAnalyzed(service, '乙客户', {
      ...VALID_ANALYSIS,
      concerns: [
        { category: 'price', severity: 'low', detail: '预算没批', evidence: '预算还没下来' },
        { category: 'price', severity: 'low', detail: '要走比价', evidence: '我们得比三家' }
      ]
    })

    const { insights } = (await service.getViewData(SCOPE)).summary
    const price = insights.concerns.find((bucket) => bucket.category === 'price')

    assert.equal(price.count, 3, 'three occurrences in total')
    assert.equal(price.recordCount, 2, 'but only two conversations mention it')
    assert.equal(price.highCount, 1)
    assert.equal(insights.concerns[0].category, 'price', 'buckets are sorted by occurrence')
  })

  it('counts intent over analyzed records only', async () => {
    const { service } = newService()
    await seedAnalyzed(service, '甲客户', VALID_ANALYSIS)
    await seedAnalyzed(service, '乙客户', { ...VALID_ANALYSIS, intentLevel: 'low' })
    await seedRecord(service, { customerName: '丙客户' }) // still a draft

    const { insights } = (await service.getViewData(SCOPE)).summary
    const byLevel = Object.fromEntries(insights.intentDistribution.map((b) => [b.level, b.count]))

    assert.equal(insights.analyzed, 2, 'the unanalyzed draft is not a denominator')
    assert.equal(insights.statusCounts.total, 3)
    assert.equal(byLevel.high, 1)
    assert.equal(byLevel.low, 1)
    assert.equal(byLevel.unknown, 0)
  })

  it('follows the human correction rather than the raw AI answer', async () => {
    const { service } = newService()
    const record = await seedAnalyzed(service, '甲客户', VALID_ANALYSIS)
    await service.confirmResult(SCOPE, {
      recordId: record.id,
      ...VALID_ANALYSIS,
      intentLevel: 'low',
      concerns: [{ category: 'competitor', severity: 'medium', detail: '在看竞品', evidence: '另一家' }]
    })

    const { insights } = (await service.getViewData(SCOPE)).summary
    const byLevel = Object.fromEntries(insights.intentDistribution.map((b) => [b.level, b.count]))

    assert.equal(byLevel.low, 1, 'the confirmed intent wins')
    assert.equal(byLevel.high, 0)
    assert.deepEqual(insights.concerns.map((b) => b.category), ['competitor'])
  })

  it('drills down from a category to the conversations behind it', async () => {
    const { service } = newService()
    await seedAnalyzed(service, '甲客户', VALID_ANALYSIS)
    await seedAnalyzed(service, '乙客户', {
      ...VALID_ANALYSIS,
      concerns: [{ category: 'competitor', severity: 'low', detail: '在比价', evidence: '另一家' }]
    })

    const priced = await service.getViewData(SCOPE, { issue: 'concern:price' })
    assert.equal(priced.total, 1)
    assert.equal(priced.items[0].customerName, '甲客户')

    // A concern category must not match against the risk list.
    assert.equal((await service.getViewData(SCOPE, { issue: 'risk:price' })).total, 0)
    // A malformed filter is ignored rather than returning nothing.
    assert.equal((await service.getViewData(SCOPE, { issue: 'nonsense' })).total, 2)
  })

  it('filters by intent level', async () => {
    const { service } = newService()
    await seedAnalyzed(service, '甲客户', VALID_ANALYSIS)
    await seedAnalyzed(service, '乙客户', { ...VALID_ANALYSIS, intentLevel: 'low' })

    const high = await service.getViewData(SCOPE, { intentLevel: 'high' })
    assert.equal(high.total, 1)
    assert.equal(high.items[0].customerName, '甲客户')
  })
})

describe('qc scorecard', () => {
  async function analyze(service, customerName, analysis) {
    const record = await seedRecord(service, { customerName })
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...analysis })
    return record
  }

  it('clamps an out-of-range axis instead of dropping the whole scorecard', async () => {
    const { service } = newService()
    const record = await analyze(service, '甲客户', {
      ...VALID_ANALYSIS,
      scores: { ...VALID_SCORES, needDiscovery: 140, budgetHandling: -20, decisionMapping: 61.4 }
    })

    const view = await service.getViewData(SCOPE, { recordId: record.id })
    const scores = view.item.aiResult.scores
    assert.equal(scores.needDiscovery, 100)
    assert.equal(scores.budgetHandling, 0)
    assert.equal(scores.decisionMapping, 61, 'fractional scores are rounded')
    assert.equal(scores.nextStepClarity, 60, 'the valid axes survive')
  })

  it('drops an axis that is not on the radar', async () => {
    const { service } = newService()
    const record = await analyze(service, '甲客户', {
      ...VALID_ANALYSIS,
      scores: { ...VALID_SCORES, enthusiasm: 90 }
    })

    const view = await service.getViewData(SCOPE, { recordId: record.id })
    assert.equal(view.item.aiResult.scores.enthusiasm, undefined)
    assert.equal(Object.keys(view.item.aiResult.scores).length, 6)
  })

  it('treats a scorecard of nothing usable as no scorecard', async () => {
    const { service } = newService()
    const record = await analyze(service, '甲客户', { ...VALID_ANALYSIS, scores: { enthusiasm: 'high' } })

    const view = await service.getViewData(SCOPE, { recordId: record.id })
    assert.equal(view.item.aiResult.scores, undefined)
  })

  it('averages each axis over the records that actually scored it', async () => {
    const { service } = newService()
    await analyze(service, '甲客户', VALID_ANALYSIS)
    await analyze(service, '乙客户', {
      ...VALID_ANALYSIS,
      // a partial scorecard: only two axes
      scores: { needDiscovery: 30, complianceRisk: 80 }
    })

    const { scoreAverages } = (await service.getViewData(SCOPE)).summary.insights
    const byDimension = Object.fromEntries(scoreAverages.map((row) => [row.dimension, row]))

    assert.equal(byDimension.needDiscovery.average, 50, '(70 + 30) / 2')
    assert.equal(byDimension.needDiscovery.sampleSize, 2)
    assert.equal(byDimension.budgetHandling.average, 45, 'only one record scored this axis')
    assert.equal(byDimension.budgetHandling.sampleSize, 1)
    assert.equal(scoreAverages.length, 6, 'every axis is reported, even unscored ones')
  })

  it('reports zeroed averages rather than an empty radar when nothing is scored', async () => {
    const { service } = newService()
    await analyze(service, '甲客户', { ...VALID_ANALYSIS, scores: undefined })

    const { scoreAverages } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(scoreAverages.length, 6)
    assert.equal(scoreAverages.every((row) => row.sampleSize === 0), true)
  })

  it('counts a human rescoring as an edit', async () => {
    const { service } = newService()
    const record = await analyze(service, '甲客户', VALID_ANALYSIS)
    await service.confirmResult(SCOPE, {
      recordId: record.id,
      ...VALID_ANALYSIS,
      scores: { ...VALID_SCORES, decisionMapping: 75 }
    })

    const { insights } = (await service.getViewData(SCOPE)).summary
    assert.equal(insights.accuracy.fieldEdits.scores, 1)
    assert.equal(insights.accuracy.acceptedAsIs, 0)
    assert.equal(insights.scoreAverages.find((r) => r.dimension === 'decisionMapping').average, 75, 'the confirmed score wins')
  })
})

describe('trend series', () => {
  it('emits a fixed window including days with no activity', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '甲客户' })

    const { trend } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(trend.length, 14, 'a fixed window, so a gap reads as a gap')
    assert.equal(trend[13].count, 1, 'today is the last point')
    assert.equal(trend[0].count, 0)
    assert.equal(trend[0].avgScore, null, 'an empty day has no score, it does not score zero')
  })

  it('averages the day score over scored records only', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '甲客户' })
    await service.requestAnalysis(SCOPE, a.id)
    await service.saveAiResult(SCOPE, { recordId: a.id, ...VALID_ANALYSIS })
    // VALID_SCORES averages to 47 (70+45+30+55+60+20 = 280 / 6)
    const b = await seedRecord(service, { customerName: '乙客户' })
    await service.requestAnalysis(SCOPE, b.id)
    await service.saveAiResult(SCOPE, {
      recordId: b.id,
      ...VALID_ANALYSIS,
      intentLevel: 'low',
      scores: Object.fromEntries(Object.keys(VALID_SCORES).map((key) => [key, 87]))
    })
    await seedRecord(service, { customerName: '丙客户' }) // filed but never analysed

    const today = (await service.getViewData(SCOPE)).summary.insights.trend[13]
    assert.equal(today.count, 3, 'volume counts every filed conversation')
    assert.equal(today.avgScore, 67, 'but the score averages only the two that were scored')
    assert.equal(today.highIntent, 1)
  })

  it('does not leak another seller activity into the trend', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '甲客户' })
    await service.createRecord(OTHER_SELLER, { customerName: '乙客户', conversation: '另一位销售的记录' })

    const mine = (await service.getViewData(SCOPE)).summary.insights.trend[13]
    assert.equal(mine.count, 1)
  })
})

describe('activityToday', () => {
  it('separates "uploaded today" from "happened today": a back-dated import shows 0 in trend but 1 in createdToday', async () => {
    const { service } = newService()
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90)
    await seedRecord(service, { customerName: '历史客户', occurredAt: threeMonthsAgo })

    const { trend, activityToday } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(trend[13].count, 0, 'the conversation happened 90 days ago, so today\'s trend bar stays empty')
    assert.equal(activityToday.createdToday, 1, 'but the row was filed today')
    assert.equal(activityToday.updatedToday, 1, 'and has not been touched since, so updatedToday agrees')
  })

  it('counts an edit to an old record under updatedToday, not createdToday', async () => {
    const { service } = newService()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const record = await seedRecord(service, { customerName: '旧记录' })
    record.createdAt = yesterday
    record.updatedAt = yesterday

    await service.requestAnalysis(SCOPE, record.id)

    const { activityToday } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(activityToday.createdToday, 0, 'the record was filed yesterday')
    assert.equal(activityToday.updatedToday, 1, 'but touched again today, by requesting analysis')
  })

  it('does not leak another seller activity into activityToday', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '甲客户' })
    await service.createRecord(OTHER_SELLER, { customerName: '乙客户', conversation: '另一位销售的记录' })

    const mine = (await service.getViewData(SCOPE)).summary.insights.activityToday
    assert.equal(mine.createdToday, 1)
  })
})

describe('accuracy statistics', () => {
  async function confirmWith(service, customerName, aiResult, confirmed) {
    const record = await seedRecord(service, { customerName })
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...aiResult })
    await service.confirmResult(SCOPE, { recordId: record.id, ...confirmed })
    return record
  }

  it('reports nothing until a record has been confirmed', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    const { accuracy } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(accuracy.sampleSize, 0, 'a completed-but-unconfirmed record says nothing about quality')
    assert.equal(accuracy.intentAgreed, 0)
  })

  it('counts an untouched confirmation as full agreement', async () => {
    const { service } = newService()
    await confirmWith(service, '甲客户', VALID_ANALYSIS, VALID_ANALYSIS)

    const { accuracy } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(accuracy.sampleSize, 1)
    assert.equal(accuracy.intentAgreed, 1)
    assert.equal(accuracy.acceptedAsIs, 1)
    assert.equal(accuracy.fieldEdits.summary, 0)
    assert.equal(accuracy.fieldEdits.concerns, 0)
  })

  it('attributes an edit to the field the salesperson actually changed', async () => {
    const { service } = newService()
    await confirmWith(service, '甲客户', VALID_ANALYSIS, {
      ...VALID_ANALYSIS,
      intentLevel: 'medium',
      summary: '销售改写后的摘要'
    })

    const { accuracy } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(accuracy.sampleSize, 1)
    assert.equal(accuracy.intentAgreed, 0)
    assert.equal(accuracy.acceptedAsIs, 0)
    assert.equal(accuracy.fieldEdits.intentLevel, 1)
    assert.equal(accuracy.fieldEdits.summary, 1)
    assert.equal(accuracy.fieldEdits.nextActions, 0, 'untouched fields are not penalised')
  })

  it('notices a reclassification even when the wording is identical', async () => {
    const { service } = newService()
    await confirmWith(service, '甲客户', VALID_ANALYSIS, {
      ...VALID_ANALYSIS,
      concerns: [
        // same text, salesperson corrected the category and the severity
        { category: 'competitor', severity: 'medium', detail: '价格高于竞品', evidence: '你们报的比另一家高不少' },
        VALID_ANALYSIS.concerns[1]
      ]
    })

    const { accuracy } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(accuracy.fieldEdits.concerns, 1)
    assert.equal(accuracy.intentAgreed, 1, 'intent was not what changed')
    assert.equal(accuracy.acceptedAsIs, 0)
  })

  it('averages over several confirmed records', async () => {
    const { service } = newService()
    await confirmWith(service, '甲客户', VALID_ANALYSIS, VALID_ANALYSIS)
    await confirmWith(service, '乙客户', VALID_ANALYSIS, { ...VALID_ANALYSIS, intentLevel: 'low' })

    const { accuracy } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(accuracy.sampleSize, 2)
    assert.equal(accuracy.intentAgreed, 1)
    assert.equal(accuracy.acceptedAsIs, 1)
    assert.equal(accuracy.fieldEdits.intentLevel, 1)
  })

  it('does not mix in another seller records', async () => {
    const { service } = newService()
    await confirmWith(service, '甲客户', VALID_ANALYSIS, { ...VALID_ANALYSIS, intentLevel: 'low' })

    const { accuracy } = (await service.getViewData(OTHER_SELLER)).summary.insights
    assert.equal(accuracy.sampleSize, 0)
  })
})

describe('customer history', () => {
  /** File a conversation for `customerName` and take it all the way to confirmed. */
  async function confirmedFor(service, customerName, analysis = VALID_ANALYSIS, scope = SCOPE) {
    const record = await service.createRecord(scope, { customerName, conversation: '销售：……客户：……' })
    await service.requestAnalysis(scope, record.id)
    await service.saveAiResult(scope, { recordId: record.id, ...analysis })
    return service.confirmResult(scope, { recordId: record.id, ...analysis })
  }

  it('returns an empty history for a first conversation instead of failing', async () => {
    const { service } = newService()
    const record = await seedRecord(service, { customerName: '华东制造' })

    const history = await service.getCustomerHistory(SCOPE, record.id)
    assert.equal(history.customerName, '华东制造')
    assert.equal(history.totalConfirmed, 0)
    assert.deepEqual(history.records, [])
  })

  it('returns only previous conversations with the SAME customer', async () => {
    const { service } = newService()
    await confirmedFor(service, '华东制造')
    await confirmedFor(service, '华南贸易')
    const current = await seedRecord(service, { customerName: '华东制造' })

    const history = await service.getCustomerHistory(SCOPE, current.id)
    assert.equal(history.totalConfirmed, 1, 'the other customer is not history for this one')
  })

  it('matches the customer case- and whitespace-insensitively, but not fuzzily', async () => {
    const { service } = newService()
    await confirmedFor(service, '  Acme Corp ')
    await confirmedFor(service, '华东制造有限公司')
    const current = await seedRecord(service, { customerName: 'acme corp' })

    const history = await service.getCustomerHistory(SCOPE, current.id)
    assert.equal(history.totalConfirmed, 1)

    const other = await seedRecord(service, { customerName: '华东制造' })
    assert.equal(
      (await service.getCustomerHistory(SCOPE, other.id)).totalConfirmed,
      0,
      'a longer legal name is a different account, not the same one'
    )
  })

  it('never includes the record under review itself', async () => {
    const { service } = newService()
    const confirmed = await confirmedFor(service, '华东制造')

    const history = await service.getCustomerHistory(SCOPE, confirmed.id)
    assert.equal(history.totalConfirmed, 0, 'a record is not its own history')
  })

  it('excludes records the salesperson has not confirmed', async () => {
    const { service } = newService()
    // completed but never signed off — raw AI output must not become "what we agreed last time"
    const completed = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, completed.id)
    await service.saveAiResult(SCOPE, { recordId: completed.id, ...VALID_ANALYSIS })
    // and a failed one
    const failed = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, failed.id)
    await service.markFailed(SCOPE, failed.id, '模型调用失败')

    const current = await seedRecord(service, { customerName: '华东制造' })
    const history = await service.getCustomerHistory(SCOPE, current.id)
    assert.equal(history.totalConfirmed, 0, 'only human-confirmed records count as history')

    // Confirming the completed one promotes it into history.
    await service.confirmResult(SCOPE, { recordId: completed.id, ...VALID_ANALYSIS })
    assert.equal((await service.getCustomerHistory(SCOPE, current.id)).totalConfirmed, 1)
  })

  it('carries the previous commitments and open questions, not the raw conversation', async () => {
    const { service } = newService()
    await confirmedFor(service, '华东制造')
    const current = await seedRecord(service, { customerName: '华东制造' })

    const [previous] = (await service.getCustomerHistory(SCOPE, current.id)).records
    assert.deepEqual(previous.nextActions, VALID_ANALYSIS.nextActions)
    assert.deepEqual(previous.missingInformation, VALID_ANALYSIS.missingInformation)
    assert.equal(previous.summary, VALID_ANALYSIS.summary)
    assert.equal(previous.intentLevel, 'high')
    assert.equal(previous.totalScore, 47, 'mean of the six axes')
    assert.equal(previous.risks[0].category, 'unconfirmed_delivery')
    assert.equal(previous.risks[0].evidence, undefined, 'evidence quotes are left out to stay small')
    assert.equal(previous.conversation, undefined, 'the original text is never replayed')
    assert.ok(previous.confirmedAt instanceof Date)
  })

  it('reports the salesperson confirmed version, not what the AI first said', async () => {
    const { service } = newService()
    const record = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })
    await service.confirmResult(SCOPE, {
      ...VALID_ANALYSIS,
      recordId: record.id,
      intentLevel: 'low',
      nextActions: ['销售改写：先确认预算再报价']
    })

    const current = await seedRecord(service, { customerName: '华东制造' })
    const [previous] = (await service.getCustomerHistory(SCOPE, current.id)).records
    assert.equal(previous.intentLevel, 'low')
    assert.deepEqual(previous.nextActions, ['销售改写：先确认预算再报价'])
  })

  it('orders most recent first and caps how much is read back', async () => {
    const { service } = newService()
    for (let index = 0; index < 7; index += 1) {
      const row = await confirmedFor(service, '华东制造', { ...VALID_ANALYSIS, summary: `第 ${index} 次沟通` })
      // Spread the sign-off times over seven days. Without this the loop confirms everything
      // inside the same millisecond and the ordering under test would not be observable.
      row.confirmedAt = new Date(2026, 8, 1 + index)
    }
    const current = await seedRecord(service, { customerName: '华东制造' })

    const byDefault = await service.getCustomerHistory(SCOPE, current.id)
    assert.equal(byDefault.totalConfirmed, 7, 'the true count is reported even when truncated')
    assert.equal(byDefault.records.length, 5, 'default limit')
    assert.equal(byDefault.records[0].summary, '第 6 次沟通', 'most recent first')

    assert.equal((await service.getCustomerHistory(SCOPE, current.id, 2)).records.length, 2)
    assert.equal((await service.getCustomerHistory(SCOPE, current.id, 99)).records.length, 7, 'clamped to the max')
    assert.equal((await service.getCustomerHistory(SCOPE, current.id, 0)).records.length, 5, 'a bogus limit falls back')
  })

  it('cannot read another seller history for the same customer', async () => {
    const { service } = newService()
    await confirmedFor(service, '华东制造', VALID_ANALYSIS, OTHER_SELLER)
    const current = await seedRecord(service, { customerName: '华东制造' })

    const history = await service.getCustomerHistory(SCOPE, current.id)
    assert.equal(history.totalConfirmed, 0, 'another seller records are out of scope')

    await assert.rejects(() => service.getCustomerHistory(OTHER_SELLER, current.id), /不存在或无权访问/)
  })
})

describe('team stats for chat', () => {
  it('reports zero customers and records with nothing filed yet', async () => {
    const { service } = newService()
    const stats = await service.getStatsForAgent(SCOPE)
    assert.equal(stats.totalRecords, 0)
    assert.equal(stats.totalCustomers, 0)
    assert.equal(stats.insights.analyzed, 0)
  })

  it('counts distinct customers the same way customer history resolves identity', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '华东制造' })
    await seedRecord(service, { customerName: '  华东制造 ' }) // same customer, different casing/whitespace
    await seedRecord(service, { customerName: '华东制造有限公司' }) // a longer legal name is a different account
    await seedRecord(service, { customerName: '华南贸易' })

    const stats = await service.getStatsForAgent(SCOPE)
    assert.equal(stats.totalRecords, 4)
    assert.equal(stats.totalCustomers, 3)
  })

  it('reuses the same insights the dashboard renders, so chat and workbench cannot disagree', async () => {
    const { service } = newService()
    const record = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, record.id)
    await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS })

    const stats = await service.getStatsForAgent(SCOPE)
    const view = await service.getViewData(SCOPE)
    assert.deepEqual(stats.insights, view.summary.insights)
  })

  it('does not mix in another seller records', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '华东制造' })
    await service.createRecord(OTHER_SELLER, { customerName: '华南贸易', conversation: '销售：……客户：……' })

    const stats = await service.getStatsForAgent(SCOPE)
    assert.equal(stats.totalRecords, 1)
    assert.equal(stats.totalCustomers, 1)
  })
})

describe('customer search for chat', () => {
  it('returns nothing for a blank query', async () => {
    const { service } = newService()
    const result = await service.searchCustomers(SCOPE, '   ')
    assert.equal(result.totalMatches, 0)
    assert.deepEqual(result.matches, [])
  })

  it('matches by substring, unlike customer history exact matching', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '华东精密制造' })

    const result = await service.searchCustomers(SCOPE, '精密')
    assert.equal(result.totalMatches, 1)
    assert.equal(result.matches[0].customerName, '华东精密制造')
  })

  it('groups by exact identity, so a longer legal name surfaces as a second, separate match', async () => {
    const { service } = newService()
    await seedRecord(service, { customerName: '华东制造' })
    await seedRecord(service, { customerName: '华东制造有限公司' })

    const result = await service.searchCustomers(SCOPE, '华东制造')
    assert.equal(result.totalMatches, 2, 'this is the ambiguous case the agent must ask the user about')
  })

  it('reports record counts, confirmed count and the most recent records for one customer', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, a.id)
    await service.saveAiResult(SCOPE, { recordId: a.id, ...VALID_ANALYSIS })
    await service.confirmResult(SCOPE, { recordId: a.id, ...VALID_ANALYSIS })
    await seedRecord(service, { customerName: '华东制造' }) // still a draft

    const [match] = (await service.searchCustomers(SCOPE, '华东')).matches
    assert.equal(match.recordCount, 2)
    assert.equal(match.confirmedCount, 1)
    assert.equal(match.recentRecords.length, 2)
    assert.ok(
      match.recentRecords.every((record) => typeof record.recordId === 'string' && record.recordId),
      'recordId is returned to the agent so it can keep working, not for the agent to show the user'
    )
  })

  it('orders matching customers by most recently active and caps how many are returned', async () => {
    const { service } = newService()
    for (let index = 0; index < 6; index += 1) {
      const row = await seedRecord(service, { customerName: `华东客户${index}` })
      row.updatedAt = new Date(2026, 8, 1 + index)
    }

    const byDefault = await service.searchCustomers(SCOPE, '华东')
    assert.equal(byDefault.totalMatches, 6, 'the true count is reported even when truncated')
    assert.equal(byDefault.matches.length, 5, 'default limit')
    assert.equal(byDefault.matches[0].customerName, '华东客户5', 'most recently active first')

    assert.equal((await service.searchCustomers(SCOPE, '华东', 2)).matches.length, 2)
    assert.equal((await service.searchCustomers(SCOPE, '华东', 99)).matches.length, 6, 'clamped to the max')
    assert.equal((await service.searchCustomers(SCOPE, '华东', 0)).matches.length, 5, 'a bogus limit falls back')
  })

  it('does not read another seller customers', async () => {
    const { service } = newService()
    await service.createRecord(OTHER_SELLER, { customerName: '华东制造', conversation: '销售：……客户：……' })

    const result = await service.searchCustomers(SCOPE, '华东')
    assert.equal(result.totalMatches, 0)
  })
})

describe('customer identity (customerId)', () => {
  it('assigns a customerId even with no source id given', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '华东制造' })
    assert.ok(a.customerId, 'a customerId is always resolved, even without a source id')
  })

  it('splits two records with the same name but different source customer ids', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '华东精密制造', customerExternalId: 'CRM-EAST-1001' })
    const b = await seedRecord(service, { customerName: '华东精密制造', customerExternalId: 'CRM-EAST-9001' })

    assert.notEqual(a.customerId, b.customerId, 'same name, different source id: different customers')

    const stats = await service.getStatsForAgent(SCOPE)
    assert.equal(stats.totalCustomers, 2, 'not silently merged into one')
  })

  it('merges two records with the same source customer id, even if the name was typed differently', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '华东精密制造', customerExternalId: 'CRM-EAST-1001' })
    const b = await seedRecord(service, { customerName: '华东精密制造(集团)', customerExternalId: 'crm-east-1001' })

    assert.equal(a.customerId, b.customerId, 'the source id is the authority once it exists, not the name')
  })

  it('keeps grouping by name when no source id is given, unaffected by unrelated ids elsewhere', async () => {
    const { service } = newService()
    const a = await seedRecord(service, { customerName: '华东精密制造' })
    const b = await seedRecord(service, { customerName: '华东精密制造' })
    const c = await seedRecord(service, { customerName: '华东精密制造', customerExternalId: 'CRM-EAST-9001' })

    assert.equal(a.customerId, b.customerId, 'still grouped by name as before this existed')
    assert.notEqual(a.customerId, c.customerId, 'a row that does carry a source id is not folded into the name group')
  })

  it('history does not cross from one customerId to the other despite the identical name', async () => {
    const { service } = newService()

    const first = await seedRecord(service, {
      customerName: '华东精密制造',
      customerExternalId: 'CRM-EAST-1001'
    })
    await service.requestAnalysis(SCOPE, first.id)
    await service.saveAiResult(SCOPE, { recordId: first.id, ...VALID_ANALYSIS })
    await service.confirmResult(SCOPE, { recordId: first.id, ...VALID_ANALYSIS })

    const other = await seedRecord(service, {
      customerName: '华东精密制造',
      customerExternalId: 'CRM-EAST-9001'
    })

    const history = await service.getCustomerHistory(SCOPE, other.id)
    assert.equal(history.totalConfirmed, 0, "the other customer's confirmed history must not leak in")
  })
})

describe('carried-over items', () => {
  it('persists what an earlier conversation left open and keeps it editable', async () => {
    const { service } = newService()
    const record = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, record.id)

    const carriedOver = ['9 月 12 日那次答应本周发 ERP 对接方案，本次客户再次追问，仍未发出']
    const completed = await service.saveAiResult(SCOPE, { recordId: record.id, ...VALID_ANALYSIS, carriedOver })
    assert.deepEqual(completed.aiResult.carriedOver, carriedOver)

    const confirmed = await service.confirmResult(SCOPE, {
      recordId: record.id,
      ...VALID_ANALYSIS,
      carriedOver: ['  销售修正：方案已在会后补发，只剩报价未给  ', '   ']
    })
    assert.deepEqual(confirmed.confirmedResult.carriedOver, ['销售修正：方案已在会后补发，只剩报价未给'])
    assert.deepEqual(confirmed.aiResult.carriedOver, carriedOver, 'raw AI output is untouched')

    // An edited carry-over is a measurable disagreement like any other field.
    const { accuracy } = (await service.getViewData(SCOPE)).summary.insights
    assert.equal(accuracy.fieldEdits.carriedOver, 1)
    assert.equal(accuracy.acceptedAsIs, 0)
  })

  it('surfaces a still-open item to the next conversation with the same customer', async () => {
    const { service } = newService()
    const first = await seedRecord(service, { customerName: '华东制造' })
    await service.requestAnalysis(SCOPE, first.id)
    await service.saveAiResult(SCOPE, { recordId: first.id, ...VALID_ANALYSIS })
    await service.confirmResult(SCOPE, {
      recordId: first.id,
      ...VALID_ANALYSIS,
      carriedOver: ['ERP 对接方案已答应两次仍未发出']
    })

    const second = await seedRecord(service, { customerName: '华东制造' })
    const [previous] = (await service.getCustomerHistory(SCOPE, second.id)).records
    assert.deepEqual(previous.carriedOver, ['ERP 对接方案已答应两次仍未发出'])
  })
})

describe('assistant message', () => {
  it('carries the customer name in plain language and keeps recordId out of the chat bubble', async () => {
    const { service } = newService()
    const record = await seedRecord(service, { customerName: '华东制造' })

    const { message } = await service.requestAnalysis(SCOPE, record.id)
    // recordId travels silently via assistant.context.set (see the remote component and
    // ConversationReviewMiddleware.wrapToolCall), never as text in the visible chat bubble.
    assert.doesNotMatch(message, new RegExp(record.id))
    assert.match(message, /华东制造/)
    assert.doesNotMatch(message, /重试/, 'a first run must not read as a retry')
    // The required call order, the scorecard rules and the empty-history reassurance are the
    // assistant's system prompt's job (xpert-conversation-review-assistant.yaml) — a salesperson
    // reading this chat bubble should not see a procedure written for the model.
    assert.doesNotMatch(message, /conversation_review_get_record/)
    assert.doesNotMatch(message, /conversation_review_save_analysis/)
  })

  it('a retry message states it is a retry and quotes the previous failure reason', async () => {
    const { service } = newService()
    const record = await seedRecord(service)
    await service.requestAnalysis(SCOPE, record.id)
    await service.markFailed(SCOPE, record.id, '模型返回超时')

    // The reason must survive into the retry prompt even though this same call clears it
    // from the record — that is why state change and message building are one operation.
    const { message } = await service.requestAnalysis(SCOPE, record.id, { isRetry: true })
    assert.match(message, /重新分析/)
    assert.match(message, /第 1 次重试/)
    assert.match(message, /上次失败原因：模型返回超时/)
  })
})
