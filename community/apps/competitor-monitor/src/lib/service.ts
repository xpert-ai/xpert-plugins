// 核心业务服务：负责采集、确定性差异、恢复、建议和审核；界面与模型均通过服务操作数据。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOperator, IsNull, Not, LessThanOrEqual, Repository } from 'typeorm'
import { deleteScopedRecords, parseDeleteRequest } from './deletion.js'
import { Advice, CollectionRound, MonitorChange, MonitorItem, Snapshot } from './entities.js'

export type Scope = { tenantId: string; organizationId: string | null }
export type ChangeCategory = Advice['category']
type ChangeInput = Pick<MonitorChange, 'roundId' | 'itemId' | 'dimension' | 'beforeValue' | 'afterValue' | 'severity' | 'evidence'>
const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
// 两组固定采集证据：按每个商品的历史快照数量交替，不代表真实商品行情。
const fixtures = [
  [
    {
      "itemId": "6543210",
      "title": "无线蓝牙耳机 降噪运动跑步耳塞 白色",
      "price": 199,
      "promo": "限时直降30元"
    },
    {
      "itemId": "6543211",
      "title": "夏季冰丝防晒袖套 UV防护 灰色",
      "price": 29.9,
      "promo": "满2件9折"
    },
    {
      "itemId": "6543212",
      "title": "便携保温杯 500ml",
      "price": 99,
      "promo": "无"
    },
    {
      "itemId": "6543213",
      "title": "机械键盘 87键",
      "price": 199,
      "promo": "无"
    },
    {
      "itemId": "6543214",
      "title": "纯棉短袖 白色",
      "price": 59,
      "promo": "无"
    },
    {
      "itemId": "6543215",
      "title": "洗衣液 2kg",
      "price": 39.9,
      "promo": "无"
    },
    {
      "itemId": "6543216",
      "title": "抽纸 24包",
      "price": 49.9,
      "promo": "满99减20"
    },
    {
      "itemId": "6543217",
      "title": "桌面收纳盒",
      "price": 29.9,
      "promo": "无"
    },
    {
      "itemId": "6543218",
      "title": "运动鞋 轻量款",
      "price": 299,
      "promo": "满300减20"
    },
    {
      "itemId": "6543219",
      "title": "中性笔 10支",
      "price": 9.9,
      "promo": "无"
    }
  ],
  [
    {
      "itemId": "6543210",
      "title": "无线蓝牙耳机 降噪运动跑步耳塞【2026新款】白色",
      "price": 179,
      "promo": "限时直降50元"
    },
    {
      "itemId": "6543211",
      "title": "夏季冰丝防晒袖套 UV防护 灰色",
      "price": 29.9,
      "promo": ""
    },
    {
      "itemId": "6543212",
      "title": "便携保温杯 500ml",
      "price": 89,
      "promo": "模拟限时优惠10元"
    },
    {
      "itemId": "6543213",
      "title": "机械键盘 87键",
      "price": 229,
      "promo": "无"
    },
    {
      "itemId": "6543214",
      "title": "纯棉短袖 白色【升级款】",
      "price": 59,
      "promo": "无"
    },
    {
      "itemId": "6543215",
      "title": "洗衣液 2kg",
      "price": 39.9,
      "promo": "第二件半价"
    },
    {
      "itemId": "6543216",
      "title": "抽纸 24包",
      "price": 49.9,
      "promo": "无"
    },
    {
      "itemId": "6543217",
      "title": "桌面收纳盒",
      "price": 29.9,
      "promo": "无"
    },
    {
      "itemId": "6543218",
      "title": "运动鞋 轻量透气升级款",
      "price": 259,
      "promo": "限时直降40元"
    },
    {
      "itemId": "6543219",
      "title": "中性笔 10支",
      "price": 9.8,
      "promo": "无"
    }
  ]
]

// Scope guards are shared by all service instances in the local API process.
const deletingScopes = new Set<string>()
const activeOperations = new Map<string, number>()
// 在异步调用前登记活动计数，阻止清理与业务写入交错；仅覆盖单进程。
function monitorOperation(_target: object, _name: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value
  descriptor.value = async function(scope: Scope, ...args: never[]) {
    const key = JSON.stringify([scope.tenantId, scope.organizationId])
    if (deletingScopes.has(key)) throw new BadRequestException('正在清理数据，请稍后重试')
    activeOperations.set(key, (activeOperations.get(key) ?? 0) + 1)
    try { return await original.call(this, scope, ...args) }
    finally { const remaining = (activeOperations.get(key) ?? 1) - 1; remaining ? activeOperations.set(key, remaining) : activeOperations.delete(key) }
  }
}

@Injectable()
export class MonitorService {
  // Serializes collection for a scope within this API process, including separate service instances.
  private static readonly collectingScopes = new Set<string>()
  constructor(
    @InjectRepository(MonitorItem) private readonly items: Repository<MonitorItem>,
    @InjectRepository(CollectionRound) private readonly rounds: Repository<CollectionRound>,
    @InjectRepository(Snapshot) private readonly snapshots: Repository<Snapshot>,
    @InjectRepository(MonitorChange) private readonly changes: Repository<MonitorChange>,
    @InjectRepository(Advice) private readonly advice: Repository<Advice>
  ) {}

  // 【核心逻辑】删除入口：解析选择 → 检查本进程范围内在途操作 → 独占范围 → 开启事务；无论成功失败都释放锁。
  async deleteRecords(scope: Scope, input: Record<string, unknown>) {
    const request = parseDeleteRequest(input)
    const key = JSON.stringify([scope.tenantId, scope.organizationId])
    if (deletingScopes.has(key) || activeOperations.has(key)) throw new BadRequestException('正在处理监控数据，请稍后重试')
    deletingScopes.add(key)
    try { return await this.items.manager.transaction(manager => deleteScopedRecords(manager, scope, request)) }
    finally { deletingScopes.delete(key) }
  }

  // 【核心逻辑】范围条件：组织为空时使用 SQL IS NULL，避免遗漏条件而扩大查询范围。
  private where(scope: Scope): { tenantId: string; organizationId: string | FindOperator<string> } {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId === null ? IsNull() : scope.organizationId
    }
  }

  // 【核心逻辑】工作台读取：分组返回有限条数的商品、轮次、变化和建议；这些数量不代表全量统计。
  async data(scope: Scope) {
    const where = this.where(scope)
    return {
      items: await this.items.find({ where, order: { itemId: 'ASC' }, take: 50 }),
      rounds: await this.rounds.find({ where: this.where(scope), order: { startedAt: 'DESC' }, take: 20 }),
      changes: await this.changes.find({ where: this.where(scope), take: 100 }),
      advice: await this.advice.find({ where: this.where(scope), take: 100 })
    }
  }

  @monitorOperation
  // 【核心逻辑】添加商品：校验固定模拟编号 → 按当前范围查重 → 创建监控中商品；重复添加返回已有记录。
  async addItem(scope: Scope, input: { itemId: string; title: string; shopName?: string; url?: string }) {
    if (!fixtures[0].some(value => value.itemId === input.itemId)) throw new BadRequestException('不支持的模拟商品 ID，请使用 6543210 至 6543219')
    const found = await this.items.findOne({ where: { ...this.where(scope), itemId: input.itemId } })
    if (found) return found
    return this.items.save(Object.assign(new MonitorItem(), this.scopeValues(scope), {
      id: id(), ...input, shopName: input.shopName ?? '示例旺旺商家', url: input.url ?? '',
      status: 'active', consecutiveFailures: 0, revision: 1
    }))
  }

  @monitorOperation
  // 【核心逻辑】监控开关：仅切换当前范围内商品状态并增加版本，不删除已有证据。
  async toggle(scope: Scope, itemId: string) {
    const item = await this.items.findOne({ where: { ...this.where(scope), itemId } })
    if (!item) throw new NotFoundException('item_not_found')
    item.status = item.status === 'active' ? 'paused' : 'active'
    item.revision++
    return this.items.save(item)
  }

  @monitorOperation
  // 【核心逻辑】采集入口：同一租户和组织在单 API 进程内互斥，避免并发采集破坏快照顺序。
  async collect(scope: Scope, input: { idempotencyKey: string; failOnItemId?: string }) {
    const key = JSON.stringify([scope.tenantId, scope.organizationId])
    if (MonitorService.collectingScopes.has(key)) throw new BadRequestException('collection_busy')
    MonitorService.collectingScopes.add(key)
    try { return await this.collectExclusive(scope, input) }
    finally { MonitorService.collectingScopes.delete(key) }
  }

  // 【核心逻辑】采集主流程：幂等查轮次 → 标记运行中 → 逐商品复用或生成快照 → 与历史快照比较 → 保存差异；失败记录原因并累计暂停阈值。
  private async collectExclusive(scope: Scope, input: { idempotencyKey: string; failOnItemId?: string }) {
    let round = await this.rounds.findOne({ where: { ...this.where(scope), idempotencyKey: input.idempotencyKey } })
    if (round?.status === 'success') {
      return { round: this.roundDto(round), reused: true, changes: await this.listRoundChangeDtos(scope, round.id) }
    }
    if (round?.status === 'paused') throw new BadRequestException('resume_required')
    round = Object.assign(round ?? new CollectionRound(), this.scopeValues(scope), {
      id: round?.id ?? id(), idempotencyKey: input.idempotencyKey, status: 'running', errorReason: null, failedItemId: null,
      retryCount: round?.retryCount ?? 0, startedAt: round?.startedAt ?? now(), finishedAt: null,
      revision: (round?.revision ?? 0) + 1
    })
    await this.rounds.save(round)
    const active = await this.items.find({ where: { ...this.where(scope), status: 'active' }, order: { itemId: 'ASC' } })
    try {
      for (const item of active) {
        round.failedItemId = item.itemId
        if (input.failOnItemId === item.itemId) throw new Error(`模拟数据源超时：${item.itemId}`)
        const historyWhere = { ...this.where(scope), itemId: item.itemId, roundId: Not(round.id), createdAt: LessThanOrEqual(round.startedAt) }
        // 排除本轮并限定历史时间；同轮已经采集的商品优先复用证据。
        const phase = (await this.snapshots.count({ where: historyWhere })) % fixtures.length
        const collected = await this.snapshots.findOneBy({ ...this.where(scope), id: `${round.id}:${item.itemId}` })
        // Reuse evidence already captured in this round when retrying a partial collection.
        const fixture = fixtures[phase].find(value => value.itemId === item.itemId)
        if (!collected && !fixture) throw new BadRequestException(`商品 ${item.itemId} 不在模拟清单中，请暂停该商品并添加 6543210 至 6543219`)
        const next = collected
          ? { itemId: item.itemId, title: collected.titleSnapshot, price: collected.price, promo: collected.promoText }
          : fixture!
        const previous = await this.snapshots.findOne({ where: { ...this.where(scope), itemId: item.itemId, roundId: Not(round.id), createdAt: LessThanOrEqual(round.startedAt) }, order: { createdAt: 'DESC', id: 'DESC' } })
        await this.snapshots.upsert({ ...this.scopeValues(scope), id: `${round.id}:${item.itemId}`, roundId: round.id,
          itemId: item.itemId, price: next.price, titleSnapshot: next.title, promoText: next.promo,
          rawJson: JSON.stringify(next), sourceAdapter: 'mock', createdAt: now() },
          ['id'])
        // 首次快照只建基线；后续逐维度比较，差异来自采集事实而不是模型输出。
        if (previous) {
          const diffs = [
            ['price', String(previous.price), String(next.price)],
            ['title', previous.titleSnapshot, next.title],
            ['promo', previous.promoText, next.promo]
          ] as const
          for (const [dimension, beforeValue, afterValue] of diffs) {
            if (beforeValue !== afterValue) await this.persistDeterministicChange(scope, {
              roundId: round.id, itemId: item.itemId, dimension, beforeValue, afterValue,
              severity: dimension === 'price' ? 'high' : 'medium', evidence: `mock:${item.itemId}:${dimension}`
            })
          }
        }
        item.consecutiveFailures = 0
        await this.items.save(item)
        round.failedItemId = null
      }
      round.status = 'success'; round.finishedAt = now(); await this.rounds.save(round)
      for (const item of active) { item.consecutiveFailures = 0; await this.items.save(item) }
      return { round: this.roundDto(round), reused: false, changes: await this.listRoundChangeDtos(scope, round.id) }
    } catch (error) {
      round.status = 'failed'; round.errorReason = error instanceof Error ? error.message : 'collection_failed'
      // 轮次重试和商品连续失败分别累计，任一达到阈值都会触发暂停。
      round.retryCount++;
      if (round.retryCount >= 3) round.status = 'paused'
      for (const item of active) {
        if (item.itemId !== round.failedItemId) continue
        item.consecutiveFailures++;
        if (item.consecutiveFailures >= 3) {
          item.status = 'paused'
          round.status = 'paused'
        }
        await this.items.save(item)
      }
      round.finishedAt = now(); await this.rounds.save(round)
      return { round: this.roundDto(round), reused: false, changes: [] }
    }
  }

  @monitorOperation
  // 【核心逻辑】同轮重试：读取原轮次的幂等键，再进入统一采集入口，不生成新的重试轮次。
  async retryCollection(scope: Scope, roundId: string, failOnItemId?: string) {
    const round = await this.rounds.findOne({ where: { ...this.where(scope), id: roundId } })
    if (!round) throw new NotFoundException('round_not_found')
    return this.collect(scope, { idempotencyKey: round.idempotencyKey, failOnItemId })
  }

  @monitorOperation
  // 【核心逻辑】恢复流程：仅恢复该暂停轮次及因连续失败暂停的关联商品，保留人工暂停的其他商品。
  async resumeCollection(scope: Scope, roundId: string) {
    const round = await this.rounds.findOne({ where: { ...this.where(scope), id: roundId } })
    if (!round || round.status !== 'paused') throw new BadRequestException('round_not_paused')
    const items = await this.items.find({ where: { ...this.where(scope), status: 'paused', itemId: round.failedItemId ?? '' } })
    for (const item of items) {
      if (item.consecutiveFailures < 3) continue
      item.status = 'active'; item.consecutiveFailures = 0; await this.items.save(item)
    }
    round.status = 'failed'; round.retryCount = 0; await this.rounds.save(round)
    return this.roundDto(round)
  }

  @monitorOperation
  // 【核心逻辑】AI 读取事实：校验轮次可分析 → 标记分析在途 → 分页读取差异 → 附上已有建议状态；多取一条判断是否还有下一页。
  async getRoundChanges(scope: Scope, input: { roundId: string; limit: number; page?: number }) {
    const round = await this.rounds.findOne({ where: { ...this.where(scope), id: input.roundId } })
    if (!round || !['success', 'partial'].includes(round.status)) throw new NotFoundException('round_not_ready')
    await this.rounds.update({ ...this.where(scope), id: round.id }, { analysisStartedAt: now() })
    const rows = await this.changes.find({ where: { ...this.where(scope), roundId: round.id }, order: { id: 'ASC' }, skip: ((input.page ?? 1) - 1) * input.limit, take: input.limit + 1 })
    const items = rows.slice(0, input.limit)
    const result = []
    for (const change of items) {
      const existingAdvice = await this.advice.findOne({ where: { ...this.where(scope), changeId: change.id } })
      result.push({ changeId: change.id, itemId: change.itemId, dimension: change.dimension,
        beforeValue: change.beforeValue, afterValue: change.afterValue, severity: change.severity,
        evidence: change.evidence, adviceStatus: existingAdvice?.status ?? 'missing' })
    }
    return { roundId: round.id, status: round.status, changes: result, page: input.page ?? 1, nextPage: rows.length > input.limit ? (input.page ?? 1) + 1 : null, hasMore: rows.length > input.limit,
      nextAction: 'Create advice only for changes whose adviceStatus is missing. When hasMore is true, read nextPage before finishing.' }
  }

  @monitorOperation
  // 【核心逻辑】分析失败：记录原因并释放分析标记；相同失败可重放，更新已有失败时校验 revision。
  async reportAnalysisIssue(scope: Scope, input: { roundId: string; reason: string; missingFields: string[] }) {
    const result = await this.rounds.update({ ...this.where(scope), id: input.roundId, status: 'success' }, {
      status: 'partial', analysisStartedAt: null, errorReason: input.reason, revision: () => 'revision + 1'
    })
    if (result.affected !== 1) {
      const existing = await this.rounds.findOne({ where: { ...this.where(scope), id: input.roundId, status: 'partial' } })
      if (!existing) throw new NotFoundException('round_not_ready')
      if (existing.errorReason === input.reason) { await this.rounds.update({ ...this.where(scope), id: existing.id }, { analysisStartedAt: null }); return { roundId: existing.id, status: existing.status, reused: true } }
      const updated = await this.rounds.update({ ...this.where(scope), id: existing.id, revision: existing.revision, status: 'partial' }, { analysisStartedAt: null, errorReason: input.reason, revision: existing.revision + 1 })
      if (updated.affected !== 1) throw new BadRequestException('revision_conflict')
      return { roundId: existing.id, status: 'partial', reused: false }
    }
    return { roundId: input.roundId, status: 'partial', reused: false }
  }

  @monitorOperation
  // 【核心逻辑】发起分析：校验范围与轮次 → 持久化分析标记 → 返回含 roundId 的消息，由界面发送给助手。
  async prepareAnalysis(scope: Scope, roundId: string) {
    const round = await this.rounds.findOne({ where: { ...this.where(scope), id: roundId } })
    if (!round || !['success', 'partial'].includes(round.status)) throw new NotFoundException('round_not_ready')
    await this.rounds.update({ ...this.where(scope), id: round.id }, { analysisStartedAt: now() })
    return { roundId, analysisMessage: `请分析采集轮次 ${roundId}。先调用 monitor_get_round_changes 读取服务端证据，再为 adviceStatus=missing 的变化创建运营建议。保留已经审核的建议。` }
  }

  @monitorOperation
  // 【核心逻辑】分析收尾：逐条确认变化已有建议 → 按 revision 更新轮次 → 清除失败原因和分析标记；不自动审核建议。
  async finishAnalysis(scope: Scope, roundId: string) {
    const round = await this.rounds.findOne({ where: { ...this.where(scope), id: roundId } })
    if (!round || !['success', 'partial'].includes(round.status)) throw new NotFoundException('round_not_ready')
    const changes = await this.changes.find({ where: { ...this.where(scope), roundId } })
    for (const change of changes) {
      if (!await this.advice.exists({ where: { ...this.where(scope), changeId: change.id } })) {
        throw new BadRequestException('analysis_incomplete')
      }
    }
    const result = await this.rounds.update({ ...this.where(scope), id: roundId, revision: round.revision }, {
      status: 'success', analysisStartedAt: null, errorReason: null, revision: round.revision + 1
    })
    if (result.affected !== 1) throw new BadRequestException('revision_conflict')
    return { roundId, status: 'success', revision: round.revision + 1 }
  }

  @monitorOperation
  // 【核心逻辑】语义判断：只允许模型更新已有变化的严重程度，不允许模型改写差异值或证据。
  async confirmChange(scope: Scope, input: { changeId: string; severity: MonitorChange['severity'] }) {
    const change = await this.changes.findOne({ where: { ...this.where(scope), id: input.changeId } })
    if (!change) throw new NotFoundException('change_not_found')
    change.severity = input.severity
    await this.changes.save(change)
    return { changeId: change.id, status: 'confirmed', severity: change.severity }
  }

  @monitorOperation
  // 【核心逻辑】建议幂等：先验证事实归属，再检查 operationId 和变化类别；返回已存在建议，绝不重置人工审核状态。
  async createAdvice(scope: Scope, input: { operationId: string; changeId: string; category: ChangeCategory; content: string; reason: string }) {
    const change = await this.changes.findOne({ where: { ...this.where(scope), id: input.changeId } })
    if (!change) throw new NotFoundException('change_not_found')
    const retried = await this.advice.findOne({ where: { ...this.where(scope), operationId: input.operationId } })
    if (retried) {
      if (retried.changeId !== input.changeId || retried.category !== input.category || retried.content !== input.content || retried.reason !== input.reason) {
        throw new BadRequestException('operation_id_conflict')
      }
      return { adviceId: retried.id, status: retried.status, revision: retried.revision, reused: true }
    }
    const existing = await this.advice.findOne({ where: { ...this.where(scope), changeId: input.changeId, category: input.category } })
    if (existing) return { adviceId: existing.id, status: existing.status, revision: existing.revision, reused: true }
    const row = Object.assign(new Advice(), this.scopeValues(scope), { id: id(), operationId: input.operationId, changeId: input.changeId,
      category: input.category, content: input.content, reason: input.reason, status: 'pending', reviewedAt: null, revision: 1 })
    await this.advice.save(row)
    return { adviceId: row.id, status: row.status, revision: row.revision, reused: false, operationId: input.operationId }
  }

  @monitorOperation
  // 【核心逻辑】人工审核：按记录 ID、租户、组织和期望版本原子更新状态；旧版本或越权记录均不允许修改。
  async review(scope: Scope, input: { id: string; status: 'approved' | 'rejected'; expectedRevision: number }) {
    const result = await this.advice.createQueryBuilder().update().set({ status: input.status, reviewedAt: now(), revision: () => 'revision + 1' })
      .where('id = :id', { id: input.id }).andWhere('tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(scope.organizationId === null ? 'organizationId IS NULL' : 'organizationId = :organizationId', scope.organizationId === null ? {} : { organizationId: scope.organizationId })
      .andWhere('revision = :revision', { revision: input.expectedRevision }).execute()
    if (result.affected !== 1) throw new BadRequestException('revision_conflict_or_not_found')
    return { adviceId: input.id, status: input.status, revision: input.expectedRevision + 1 }
  }

  // 【核心逻辑】差异去重：以轮次、商品、维度组成稳定主键，重试写入同一条事实记录。
  private async persistDeterministicChange(scope: Scope, input: ChangeInput) {
    const key = `${input.roundId}:${input.itemId}:${input.dimension}`
    await this.changes.upsert({ ...this.scopeValues(scope), id: key, ...input }, ['id'])
  }
  // 【核心逻辑】采集结果摘要：返回有界差异列表，完整分析需使用分页读取工具。
  private async listRoundChangeDtos(scope: Scope, roundId: string) {
    const rows = await this.changes.find({ where: { ...this.where(scope), roundId }, take: 100 })
    return rows.map(({ id, itemId, dimension, beforeValue, afterValue, severity, evidence }) => ({ id, itemId, dimension, beforeValue, afterValue, severity, evidence }))
  }
  // 【核心逻辑】写入范围：业务记录的租户与组织来自可信上下文，不采用模型或界面传入的范围。
  private scopeValues(scope: Scope) { return { tenantId: scope.tenantId, organizationId: scope.organizationId } }
  // 【核心逻辑】轮次回执：只返回调用方需要的状态、错误原因、重试次数和版本。
  private roundDto(round: CollectionRound) { return { id: round.id, status: round.status, retryCount: round.retryCount, errorReason: round.errorReason, revision: round.revision } }
}
