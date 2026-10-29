import { randomUUID } from 'crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InspectionService } from '../src/lib/inspection.service.js'
import type { InspectionScope } from '../src/lib/types.js'

// ---------- 内存 Repository 实现（仅覆盖 service 用到的 API） ----------

type WhereClause = Record<string, unknown>

function matchWhere(entity: Record<string, unknown>, where: WhereClause): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as object)) {
      const op = value as { _type?: string; value: unknown }
      if (op._type === 'in') {
        if (!(op.value as unknown[]).includes(entity[key])) return false
        continue
      }
      if (op._type === 'like') {
        const pattern = String(op.value)
        const escaped = pattern.replace(/\\/g, '').replace(/%/g, '')
        if (!String(entity[key] ?? '').includes(escaped)) return false
        continue
      }
    }
    if (entity[key] !== value) return false
  }
  return true
}

function createMockRepository<T extends { id: string }>() {
  const store = new Map<string, T>()
  return {
    store,
    create: (data: Partial<T>): T => ({ ...(data as T) }),
    async save(entity: T | T[]): Promise<T | T[]> {
      const entities = Array.isArray(entity) ? entity : [entity]
      for (const item of entities) {
        store.set(item.id, item)
      }
      return entity
    },
    async findOne(options: { where: WhereClause }): Promise<T | null> {
      for (const entity of store.values()) {
        if (matchWhere(entity as unknown as Record<string, unknown>, options.where)) {
          return entity
        }
      }
      return null
    },
    async find(options: { where: WhereClause; order?: Record<string, 'ASC' | 'DESC'>; take?: number }): Promise<T[]> {
      let rows = [...store.values()].filter((entity) =>
        matchWhere(entity as unknown as Record<string, unknown>, options.where)
      )
      if (options.order) {
        const [key, dir] = Object.entries(options.order)[0]
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[key]
          const bv = (b as Record<string, unknown>)[key]
          const cmp = av > bv ? 1 : av < bv ? -1 : 0
          return dir === 'DESC' ? -cmp : cmp
        })
      }
      if (options.take) {
        rows = rows.slice(0, options.take)
      }
      return rows
    },
    async findAndCount(options: {
      where: WhereClause
      order?: Record<string, 'ASC' | 'DESC'>
      skip?: number
      take?: number
    }): Promise<[T[], number]> {
      const rows = [...store.values()].filter((entity) =>
        matchWhere(entity as unknown as Record<string, unknown>, options.where)
      )
      if (options.order) {
        const [key, dir] = Object.entries(options.order)[0]
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[key]
          const bv = (b as Record<string, unknown>)[key]
          const cmp = av > bv ? 1 : av < bv ? -1 : 0
          return dir === 'DESC' ? -cmp : cmp
        })
      }
      const start = options.skip ?? 0
      const page = rows.slice(start, start + (options.take ?? 20))
      return [page, rows.length]
    },
    async remove(entity: T): Promise<T> {
      store.delete(entity.id)
      return entity
    }
  }
}

function buildService() {
  const caseRepo = createMockRepository<never>()
  const historyRepo = createMockRepository<never>()
  const service = new InspectionService(
    caseRepo as never,
    historyRepo as never
  )
  return { service, caseRepo, historyRepo }
}

function scope(overrides: Partial<InspectionScope> = {}): InspectionScope {
  return {
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    workspaceId: null,
    projectId: null,
    userId: 'user-1',
    ...overrides
  }
}

// ---------- 测试用例 ----------

test('创建工单：生成工单号并处于 draft 状态，且按 scope 隔离', async () => {
  const { service } = buildService()
  const created = await service.createCase(scope(), {
    title: '晋中XX基站 BBU 反复掉电',
    deviceType: 'BBU',
    faultDescription: 'BBU 频繁掉电，直流输入电压异常，设备不定期重启。',
    severity: 'high'
  })

  assert.match(created.caseNo, /^INSP-\d{8}-\d{4}$/)
  assert.equal(created.status, 'draft')
  assert.equal(created.retryCount, 0)

  // 其他租户看不到
  const otherTenant = await service.getCase(scope({ tenantId: 'tenant-b' }), created.id)
  assert.equal(otherTenant, null)

  // 本租户可见
  const visible = await service.getCase(scope(), created.id)
  assert.equal(visible.id, created.id)
})

test('AI 解析：保存结构化分析并流转到 analyzed，严重程度被规范化', async () => {
  const { service } = buildService()
  const created = await service.createCase(scope(), {
    title: 'RRU 驻波告警',
    faultDescription: 'RRU 上报高驻波比告警，小区覆盖下降。'
  })

  await service.saveAiAnalysis(scope(), created.id, {
    deviceType: 'RRU',
    faultCategory: '驻波告警',
    faultSummary: '高驻波比导致覆盖下降',
    severity: 'medium',
    impact: '影响 2 个小区',
    possibleCauses: ['馈线接头进水', '天线损坏']
  })

  const updated = await service.getCase(scope(), created.id)
  assert.equal(updated.status, 'analyzed')
  assert.equal(updated.deviceType, 'RRU')
  assert.equal(updated.severity, 'medium')
  assert.deepEqual(updated.aiAnalysis.possibleCauses, ['馈线接头进水', '天线损坏'])

  // 非法严重程度被丢弃
  await service.saveAiAnalysis(scope(), created.id, { severity: 'urgent' as never })
  const again = await service.getCase(scope(), created.id)
  assert.equal(again.severity, 'medium')
})

test('历史检索：按设备类型与关键词召回并打分，无关键词时返回全部', async () => {
  const { service } = buildService()
  const created = await service.createCase(scope(), {
    title: 'BBU 掉电',
    faultDescription: 'BBU 反复掉电'
  })

  const byDevice = await service.searchHistory(scope(), { deviceType: 'BBU', keywords: ['掉电'] })
  assert.ok(byDevice.length >= 1)
  assert.ok(byDevice.every((r) => r.deviceType === 'BBU'))
  assert.ok(byDevice[0].matchedKeywords.includes('掉电'))

  const byKeyword = await service.searchHistory(scope(), { keywords: ['驻波'] })
  assert.ok(byKeyword.length >= 1)
  assert.ok(byKeyword.every((r) => r.faultCategory.includes('驻波')))

  const all = await service.searchHistory(scope(), {})
  assert.equal(all.length, 5) // 默认最多 5 条

  // caseId 不影响结果集，仅作上下文标记
  const withCase = await service.searchHistory(scope(), { caseId: created.id, keywords: ['驻波'] })
  assert.ok(withCase.length >= 1)
})

test('AI 建议：保存建议并引用历史方案，流转到 reviewing', async () => {
  const { service } = buildService()
  const created = await service.createCase(scope(), {
    title: '传输光路中断',
    faultDescription: '传输设备上报光路中断，业务全阻。'
  })
  const history = await service.searchHistory(scope(), { deviceType: '传输设备', keywords: ['光路'] })
  assert.ok(history.length >= 1)

  await service.saveRecommendation(scope(), created.id, {
    recommendation: '1. 光功率计两端测试；2. OTDR 定位断点；3. 重熔后复测。',
    historyReferenceIds: [history[0].id]
  })

  const updated = await service.getCase(scope(), created.id)
  assert.equal(updated.status, 'reviewing')
  assert.equal(updated.recommendedAction.includes('OTDR'), true)
  assert.equal(updated.historyReferences.length, 1)
  assert.equal(updated.historyReferences[0].id, history[0].id)
})

test('确认处理方案：写入 resolution 并沉淀到历史库，close 后关闭工单', async () => {
  const { service, historyRepo } = buildService()
  const created = await service.createCase(scope(), {
    title: '动环高温告警',
    deviceType: '动环监控',
    faultDescription: '机房高温告警，空调制冷异常。'
  })
  await service.saveAiAnalysis(scope(), created.id, {
    deviceType: '动环监控',
    faultCategory: '高温告警',
    severity: 'high'
  })

  const confirmed = await service.confirmResolution(scope(), created.id, {
    resolution: '清洗空调滤网，检查压缩机，修复后温度回落。',
    resolvedBy: '李工',
    close: true
  })
  assert.equal(confirmed.status, 'closed')
  assert.equal(confirmed.resolvedBy, '李工')
  assert.ok(confirmed.resolvedAt instanceof Date)

  // 沉淀到历史库：可按设备类型检索到
  const history = await service.searchHistory(scope(), { deviceType: '动环监控', keywords: ['高温'] })
  const sunk = history.find((r) => r.sourceCaseNo === confirmed.caseNo)
  assert.ok(sunk, '确认后的处理方案应沉淀为历史记录')
  assert.equal(sunk.resolution, '清洗空调滤网，检查压缩机，修复后温度回落。')
})

test('失败重试：reportFailure 标记失败，retryCase 重置且不产生重复工单', async () => {
  const { service } = buildService()
  const created = await service.createCase(scope(), {
    title: '天线覆盖异常',
    faultDescription: '弱覆盖，需要检查天线。'
  })

  const failed = await service.reportFailure(scope(), created.id, {
    reason: '故障描述过于模糊，无法确定设备类型'
  })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.failureReason, '故障描述过于模糊，无法确定设备类型')

  // 重试
  const retried = await service.retryCase(scope(), created.id)
  assert.equal(retried.status, 'analyzing')
  assert.equal(retried.retryCount, 1)
  assert.equal(retried.failureReason, null)

  // 同一工单 ID，未产生新工单
  const all = await service.getWorkbenchData(scope(), {})
  assert.equal(all.total, 1)

  // 未失败的工单不能重试
  await assert.rejects(() => service.retryCase(scope(), created.id), /只有失败状态/)
})

test('视图数据：分页与搜索', async () => {
  const { service } = buildService()
  for (let i = 0; i < 5; i += 1) {
    await service.createCase(scope(), {
      title: `工单 ${i}`,
      faultDescription: `故障描述 ${i}`
    })
  }

  const firstPage = await service.getWorkbenchData(scope(), { page: 1, pageSize: 2 })
  assert.equal(firstPage.total, 5)
  assert.equal(firstPage.cases.length, 2)

  const searched = await service.getWorkbenchData(scope(), { search: '工单 3' })
  assert.equal(searched.total, 1)

  const otherTenant = await service.getWorkbenchData(scope({ tenantId: 'tenant-b' }), {})
  assert.equal(otherTenant.total, 0)
})

test('scope 隔离：不同 organization/workspace 不可见对方数据', async () => {
  const { service } = buildService()
  const created = await service.createCase(scope(), {
    title: '隔离测试',
    faultDescription: '只有 org-a 可见'
  })

  const otherOrg = await service.getCase(scope({ organizationId: 'org-b' }), created.id)
  assert.equal(otherOrg, null)

  const sameOrg = await service.getCase(scope(), created.id)
  assert.equal(sameOrg.id, created.id)
})
