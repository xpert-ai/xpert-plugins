import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const entities = await import(pathToFileURL(join(packageRoot, 'dist/lib/entities/index.js')).href)
const { MeetingService } = await import(pathToFileURL(join(packageRoot, 'dist/lib/meeting.service.js')).href)

const scope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1',
  assistantId: 'assistant-1',
  conversationId: 'conversation-1'
}

test('successful extraction is idempotent, reviewable, confirmable, and durable', async () => {
  const database = createDatabase()
  const service = createService(database)
  const beginInput = {
    operationId: 'begin-success-001',
    title: '产品周会',
    sourceText: '会议决定本周完成验收。张敏负责补齐失败重试，截止 2026-09-18。'
  }
  const begun = await service.beginExtraction(scope, beginInput)
  const replay = await service.beginExtraction(scope, beginInput)
  assert.deepEqual(replay, begun)
  assert.equal(database.rows.MeetingRecord.length, 1)

  await assert.rejects(
    service.beginExtraction(scope, { ...beginInput, title: '复用 operationId 的不同请求' }),
    (error) => error.code === 'OPERATION_ID_REUSED'
  )

  const decisionInput = {
    operationId: 'decision-success-001',
    meetingId: begun.meetingId,
    itemKey: 'decision_1',
    statement: '本周完成验收。',
    evidenceQuote: '会议决定本周完成验收。',
    confidence: 0.98,
    sortOrder: 0,
    baseRevision: 1
  }
  const decisionReceipt = await service.upsertDecision(scope, decisionInput)
  const decisionReplay = await service.upsertDecision(scope, decisionInput)
  assert.deepEqual(decisionReplay, decisionReceipt)
  assert.equal(database.rows.MeetingDecision.length, 1)

  const actionReceipt = await service.upsertActionItem(scope, {
    operationId: 'action-success-001',
    meetingId: begun.meetingId,
    itemKey: 'action_1',
    task: '补齐失败重试',
    owner: '张敏',
    dueDate: '2026-09-18',
    priority: 'high',
    evidenceQuote: '张敏负责补齐失败重试，截止 2026-09-18。',
    confidence: 0.97,
    sortOrder: 0,
    baseRevision: decisionReceipt.revision
  })
  const finalized = await service.finalizeExtraction(scope, {
    operationId: 'finalize-success-001',
    meetingId: begun.meetingId,
    baseRevision: actionReceipt.revision
  })
  assert.equal(finalized.status, 'review_required')
  assert.equal(finalized.decisionCount, 1)
  assert.equal(finalized.actionItemCount, 1)

  const detail = await service.getContext(scope, begun.meetingId)
  assert.equal(detail.sourceText, beginInput.sourceText)
  assert.equal(detail.decisions[0].evidenceQuote, decisionInput.evidenceQuote)
  assert.equal(detail.actionItems[0].owner, '张敏')

  const edited = await service.updateDecision(scope, begun.meetingId, {
    decisionId: detail.decisions[0].id,
    expectedRevision: detail.revision,
    statement: '本周五前完成中文验收。',
    reviewStatus: 'edited'
  })
  await assert.rejects(
    service.confirmMeeting(scope, begun.meetingId, detail.revision),
    (error) => error.code === 'MEETING_REVISION_CONFLICT'
  )
  const confirmed = await service.confirmMeeting(scope, begun.meetingId, edited.revision)
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.decisions[0].reviewStatus, 'edited')
  assert.equal(confirmed.actionItems[0].reviewStatus, 'confirmed')
  assert.equal(confirmed.actionItems[0].status, 'pending')
  await assert.rejects(
    service.updateDecision(scope, begun.meetingId, {
      decisionId: confirmed.decisions[0].id,
      expectedRevision: confirmed.revision,
      statement: '确认后不可直接覆盖',
      reviewStatus: 'edited'
    }),
    (error) => error.code === 'MEETING_NOT_REVIEWABLE'
  )
})

test('failed extraction persists a retryable failure and clears only pending candidates on retry', async () => {
  const database = createDatabase()
  const service = createService(database)
  const begun = await service.beginExtraction(scope, {
    operationId: 'begin-failure-001',
    title: '失败路径会议',
    sourceText: '会议原文仍然必须保存，以便失败后由用户发起安全重试。'
  })
  const decision = await service.upsertDecision(scope, {
    operationId: 'decision-failure-001',
    meetingId: begun.meetingId,
    itemKey: 'decision_1',
    statement: '保留会议原文。',
    evidenceQuote: '会议原文仍然必须保存',
    confidence: 0.8,
    sortOrder: 0,
    baseRevision: begun.revision
  })
  const failed = await service.reportFailure(scope, {
    operationId: 'failure-001',
    meetingId: begun.meetingId,
    failureCode: 'MODEL_CALL_FAILED',
    summary: '模型暂时不可用，请稍后重试。',
    baseRevision: decision.revision
  })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.retryable, true)
  const retry = await service.beginExtraction(scope, {
    operationId: 'retry-001',
    meetingId: begun.meetingId,
    baseRevision: failed.revision
  })
  assert.equal(retry.status, 'processing')
  assert.equal(retry.extractionAttempt, 2)
  assert.equal(database.rows.MeetingDecision.length, 0)
  const detail = await service.getContext(scope, begun.meetingId)
  assert.match(detail.sourceText, /失败后由用户发起安全重试/)
  assert.equal(detail.errorCode, null)
})

test('confirmed actions are trackable and Agent risk reviews remain under human control', async () => {
  const database = createDatabase()
  const service = createService(database)
  const begun = await service.beginExtraction(scope, {
    operationId: 'begin-execution-001',
    title: '交付跟进会',
    sourceText: '团队负责补齐部署说明，但会议没有约定验收人和截止日期。'
  })
  const action = await service.upsertActionItem(scope, {
    operationId: 'action-execution-001',
    meetingId: begun.meetingId,
    itemKey: 'action_1',
    task: '补齐部署说明',
    owner: '交付团队',
    priority: 'high',
    evidenceQuote: '团队负责补齐部署说明',
    confidence: 0.82,
    sortOrder: 0,
    baseRevision: begun.revision
  })
  const finalized = await service.finalizeExtraction(scope, {
    operationId: 'finalize-execution-001',
    meetingId: begun.meetingId,
    baseRevision: action.revision
  })
  const confirmed = await service.confirmMeeting(scope, begun.meetingId, finalized.revision)
  const tracked = await service.updateExecutionAction(scope, begun.meetingId, {
    actionItemId: confirmed.actionItems[0].id,
    expectedRevision: confirmed.revision,
    status: 'in_progress'
  })
  assert.equal(tracked.status, 'in_progress')
  await assert.rejects(
    service.updateExecutionAction(scope, begun.meetingId, {
      actionItemId: confirmed.actionItems[0].id,
      expectedRevision: confirmed.revision,
      status: 'completed'
    }),
    (error) => error.code === 'MEETING_REVISION_CONFLICT'
  )

  const execution = await service.getExecutionContext(scope, { includeCompleted: true })
  assert.equal(execution.summary.inProgress, 1)
  assert.equal(execution.summary.missingDueDate, 1)
  assert.deepEqual(execution.actions[0].ruleFlags, ['missing_due_date'])

  const review = await service.beginExecutionReview(scope, {
    operationId: 'begin-review-001',
    focus: 'open_actions'
  })
  const riskInput = {
    operationId: 'risk-review-001',
    reviewId: review.reviewId,
    signalKey: 'ambiguous-delivery-owner',
    riskType: 'ambiguous_commitment',
    severity: 'medium',
    title: '负责人无法落实到个人',
    rationale: '负责人只有团队名称，无法明确追责或催办。',
    evidenceQuote: '团队负责补齐部署说明',
    recommendation: '由人工指定唯一负责人并补充验收人。',
    meetingId: begun.meetingId,
    actionItemId: confirmed.actionItems[0].id,
    confidence: 0.89,
    baseRevision: review.revision
  }
  const risk = await service.upsertRiskSignal(scope, riskInput)
  const replay = await service.upsertRiskSignal(scope, riskInput)
  assert.deepEqual(replay, risk)
  assert.equal(database.rows.MeetingRiskSignal.length, 1)

  const ready = await service.finalizeExecutionReview(scope, {
    operationId: 'finalize-review-001',
    reviewId: review.reviewId,
    summary: '一项行动正在进行，但负责人和截止日期需要进一步明确。',
    followUpBrief: '## 下次会议重点\n\n- 指定唯一负责人。\n- 补充截止日期和验收标准。',
    baseRevision: risk.revision
  })
  assert.equal(ready.status, 'ready')
  assert.equal(ready.riskCount, 1)

  const accepted = await service.updateRiskSignalStatus(scope, review.reviewId, {
    riskSignalId: risk.riskSignalId,
    expectedRevision: ready.revision,
    reviewStatus: 'accepted'
  })
  assert.equal(accepted.reviewStatus, 'accepted')
  await assert.rejects(
    service.updateRiskSignalStatus(scope, review.reviewId, {
      riskSignalId: risk.riskSignalId,
      expectedRevision: ready.revision,
      reviewStatus: 'resolved'
    }),
    (error) => error.code === 'EXECUTION_REVIEW_REVISION_CONFLICT'
  )

  const refreshed = await service.getExecutionContext(scope, { includeCompleted: true })
  assert.equal(refreshed.latestReview.status, 'ready')
  assert.match(refreshed.latestReview.followUpBrief, /下次会议重点/)
  assert.equal(refreshed.agentSignals[0].reviewStatus, 'accepted')
})

function createService(database) {
  return new MeetingService(
    database.dataSource,
    database.repositories.MeetingRecord,
    database.repositories.MeetingDecision,
    database.repositories.MeetingActionItem,
    database.repositories.MeetingExecutionReview,
    database.repositories.MeetingRiskSignal
  )
}

function createDatabase() {
  const rows = {
    MeetingRecord: [],
    MeetingDecision: [],
    MeetingActionItem: [],
    MeetingExecutionReview: [],
    MeetingRiskSignal: [],
    MeetingOperation: []
  }
  let sequence = 1
  const manager = {
    getRepository(entity) {
      return repositories[entity.name]
    },
    create(entity, value) {
      return Object.assign(new entity(), value)
    },
    async save(value) {
      const key = value.constructor.name
      const collection = rows[key]
      if (!value.id) value.id = uuid(sequence++)
      const now = new Date('2026-09-16T10:00:00.000Z')
      if (!value.createdAt) value.createdAt = now
      value.updatedAt = now
      const index = collection.findIndex((item) => item.id === value.id)
      if (index >= 0) collection[index] = value
      else collection.push(value)
      return value
    }
  }
  const repositories = Object.fromEntries(
    Object.entries(entities)
      .filter(([name]) => rows[name])
      .map(([name, entity]) => [name, createRepository(entity, rows[name], manager)])
  )
  const dataSource = {
    manager,
    async transaction(work) {
      return work(manager)
    }
  }
  return { rows, repositories, dataSource }
}

function createRepository(entity, collection, manager) {
  return {
    create(value) {
      return Object.assign(new entity(), value)
    },
    save(value) {
      return manager.save(value)
    },
    findOneBy(criteria) {
      return Promise.resolve(collection.find((item) => matchesCriteria(item, criteria)) ?? null)
    },
    async delete(criteria) {
      const removed = collection.filter((item) => matchesCriteria(item, criteria))
      for (const item of removed) collection.splice(collection.indexOf(item), 1)
      return { affected: removed.length }
    },
    async update(criteria, changes) {
      const selected = collection.filter((item) => matchesCriteria(item, criteria))
      selected.forEach((item) => Object.assign(item, changes))
      return { affected: selected.length }
    },
    createQueryBuilder(alias) {
      return createQueryBuilder(entity, collection, alias)
    }
  }
}

function createQueryBuilder(entity, collection, alias) {
  let predicates = []
  let pendingSet = null
  const builder = {
    where(condition, parameters = {}) {
      predicates = [predicate(condition, parameters)]
      return builder
    },
    andWhere(condition, parameters = {}) {
      predicates.push(predicate(condition, parameters))
      return builder
    },
    setLock() { return builder },
    orderBy() { return builder },
    addOrderBy() { return builder },
    skip() { return builder },
    take() { return builder },
    select() { return builder },
    addSelect() { return builder },
    groupBy() { return builder },
    update() { return builder },
    set(value) {
      pendingSet = value
      return builder
    },
    async execute() {
      const selected = collection.filter(matches)
      if (pendingSet) selected.forEach((item) => Object.assign(item, pendingSet))
      return { affected: selected.length }
    },
    async getOne() {
      return collection.find(matches) ?? null
    },
    async getMany() {
      return collection.filter(matches)
    },
    async getCount() {
      return collection.filter(matches).length
    },
    async getManyAndCount() {
      const selected = collection.filter(matches)
      return [selected, selected.length]
    },
    async getRawMany() {
      const counts = new Map()
      for (const item of collection.filter(matches)) counts.set(item.status, (counts.get(item.status) ?? 0) + 1)
      return [...counts.entries()].map(([status, count]) => ({ status, count: String(count) }))
    },
    async getRawOne() {
      const selected = collection.filter(matches)
      const today = '2026-09-17'
      const dueSoon = '2026-09-20'
      const open = (item) => item.status !== 'completed' && item.status !== 'cancelled'
      return {
        total: String(selected.length),
        pending: String(selected.filter((item) => item.status === 'pending').length),
        inProgress: String(selected.filter((item) => item.status === 'in_progress').length),
        completed: String(selected.filter((item) => item.status === 'completed').length),
        cancelled: String(selected.filter((item) => item.status === 'cancelled').length),
        overdue: String(selected.filter((item) => open(item) && item.dueDate && item.dueDate < today).length),
        dueSoon: String(selected.filter((item) => open(item) && item.dueDate && item.dueDate >= today && item.dueDate <= dueSoon).length),
        missingOwner: String(selected.filter((item) => open(item) && item.owner == null).length),
        missingDueDate: String(selected.filter((item) => open(item) && item.dueDate == null).length)
      }
    }
  }
  function matches(item) {
    return predicates.every((test) => test(item))
  }
  return builder
}

function predicate(condition, parameters) {
  const checks = []
  for (const [key, value] of Object.entries(parameters)) {
    const property = key === 'meetingId' && condition.includes('.id = :meetingId') ? 'id' : {
      meetingId: 'meetingId',
      itemKey: 'itemKey',
      decisionId: 'id',
      actionItemId: 'id',
      riskActionItemId: 'id',
      riskMeetingId: 'meetingId',
      reviewId: 'reviewId',
      signalKey: 'signalKey',
      riskSignalId: 'id',
      executionStatus: 'status',
      tenantId: 'tenantId',
      organizationId: 'organizationId',
      status: 'status',
      pending: 'reviewStatus'
    }[key]
    if (property) checks.push((item) => item[property] === value)
  }
  if (condition.includes(aliasField(condition, 'tenantId') + ' IS NULL')) checks.push((item) => item.tenantId == null)
  if (condition.includes(aliasField(condition, 'organizationId') + ' IS NULL')) checks.push((item) => item.organizationId == null)
  return (item) => checks.every((check) => check(item))
}

function aliasField(condition, field) {
  const match = condition.match(new RegExp('([a-z]+)\\.' + field, 'i'))
  return (match?.[1] ?? '') + '.' + field
}

function matchesCriteria(item, criteria) {
  return Object.entries(criteria).every(([key, value]) => item[key] === value)
}

function uuid(value) {
  return '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
}
