import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ScrapeTaskIntakeMockCatalogService } from './scrape-task-intake-mock-catalog.service'
import { ScrapeTaskIntakeService } from './scrape-task-intake.service'
import { ScrapeTask, ScrapeTaskLog } from './entities'
import type { ScrapeTaskScope } from './types'

function matchesWhere(item: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true
    if (value && typeof value === 'object' && typeof (value as { _type?: unknown })._type === 'string') {
      const operator = value as { _type: string; _value?: unknown }
      const itemValue = item[key]
      if (operator._type === 'in') {
        return Array.isArray(operator._value) && operator._value.includes(itemValue)
      }
      if (operator._type === 'moreThanOrEqual') {
        return itemValue != null && itemValue >= (operator._value as never)
      }
      return true
    }
    return item[key] === value
  })
}

function createRepository<T extends { id?: string }>() {
  const store: T[] = []
  const repository = {
    store,
    manager: {
      transaction: jest.fn(async (callback: (manager: { getRepository: (entity: unknown) => typeof repository }) => unknown) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === ScrapeTaskLog ? (logRepositoryRef.current as typeof repository) : repository
        })
      )
    },
    create: jest.fn((input: T) => ({ ...input })),
    save: jest.fn(async (input: T) => {
      const row = {
        ...input,
        id: input.id ?? `id-${store.length + 1}`,
        createdAt: (input as { createdAt?: Date }).createdAt ?? new Date()
      } as T
      const index = store.findIndex((item) => item.id === row.id)
      if (index >= 0) {
        store[index] = row
      } else {
        store.push(row)
      }
      return row
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<T> }) => {
      return (
        store.find((item) => matchesWhere(item as Record<string, unknown>, where as Record<string, unknown>)) ?? null
      )
    }),
    find: jest.fn(async ({ where }: { where?: Partial<T> } = {}) => {
      return store.filter((item) =>
        matchesWhere(item as Record<string, unknown>, (where ?? {}) as Record<string, unknown>)
      )
    }),
    count: jest.fn(async () => store.length)
  }
  return repository
}

const logRepositoryRef: { current?: ReturnType<typeof createRepository<ScrapeTaskLog>> } = {}

describe('ScrapeTaskIntakeService', () => {
  const scope: ScrapeTaskScope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1'
  }

  let taskRepository: ReturnType<typeof createRepository<ScrapeTask>>
  let logRepository: ReturnType<typeof createRepository<ScrapeTaskLog>>
  let service: ScrapeTaskIntakeService

  beforeEach(() => {
    taskRepository = createRepository<ScrapeTask>()
    logRepository = createRepository<ScrapeTaskLog>()
    logRepositoryRef.current = logRepository
    service = new ScrapeTaskIntakeService(
      taskRepository as never,
      logRepository as never,
      new ScrapeTaskIntakeMockCatalogService()
    )
  })

  it('saves a complete AI generated task as pending confirmation and creates an ai_generated log', async () => {
    const task = await service.saveGeneratedTask(
      {
        sourceType: 'agent_chat',
        originalContent: '需要采集某电商平台笔记本电脑前 100 个商品的名称和价格，每周更新，导出 Excel。',
        targetUrl: 'https://example.com/search?q=laptop',
        targetSite: '某电商平台',
        pagesScope: 'search',
        dataFields: [
          { name: '商品名称', description: '商品标题', required: true },
          { name: '价格', description: '当前售价', required: true }
        ],
        crawlFrequency: 'weekly',
        deliveryFormat: 'excel',
        priority: 'medium',
        antiBotNotes: '目标站点可能有人机验证，需配置代理池。',
        complianceNotes: '需确认站点 robots.txt 与 ToS。',
        aiConfidence: 0.87
      },
      scope
    )

    expect(task.status).toBe('pending_confirmation')
    expect(task.taskNo).toMatch(/^ST-\d{8}-\d{4}$/)
    expect(task.dataFields).toHaveLength(2)
    expect(logRepository.store).toHaveLength(1)
    expect(logRepository.store[0].action).toBe('ai_generated')
  })

  it('saves an AI generated task with completeness tips as needs supplement', async () => {
    const task = await service.saveGeneratedTask(
      {
        originalContent: '帮我抓一下某网站的数据。',
        completenessTips: ['缺少目标站点链接', '缺少采集字段说明']
      },
      scope
    )

    expect(task.status).toBe('needs_supplement')
    expect(task.completenessTips).toHaveLength(2)
  })

  it('rejects an empty original content', async () => {
    await expect(service.saveGeneratedTask({ originalContent: '   ' }, scope)).rejects.toThrow(BadRequestException)
  })

  it('returns the earlier open task instead of creating a duplicate for the same request in the same conversation', async () => {
    const input = {
      originalContent: '采集某电商平台手机类目商品名称和价格。',
      targetSite: '某电商平台',
      dataFields: [{ name: '商品名称' }]
    }
    const first = await service.saveGeneratedTask(input, scope)
    const second = await service.saveGeneratedTask(input, scope)

    expect(second.id).toBe(first.id)
    expect(taskRepository.store).toHaveLength(1)
    expect(logRepository.store.some((log) => log.action === 'dedupe_skipped')).toBe(true)
  })

  it('does not dedupe the same request from a different organization scope', async () => {
    const input = {
      originalContent: '采集某电商平台手机类目商品名称和价格。',
      targetSite: '某电商平台',
      dataFields: [{ name: '商品名称' }]
    }
    const first = await service.saveGeneratedTask(input, scope)
    const other = await service.saveGeneratedTask(input, {
      ...scope,
      organizationId: 'org-2',
      conversationId: 'conversation-2'
    })

    expect(other.id).not.toBe(first.id)
    expect(taskRepository.store).toHaveLength(2)
  })

  it('normalizes data fields and drops invalid entries', async () => {
    const task = await service.saveGeneratedTask(
      {
        originalContent: '采集商品名称和价格。',
        dataFields: [
          { name: '商品名称' },
          { name: '   ' },
          (null as unknown) as { name: string }
        ]
      },
      scope
    )

    expect(task.dataFields).toHaveLength(1)
    expect(task.dataFields?.[0].name).toBe('商品名称')
  })

  it('confirms a task with the human confirmed snapshot', async () => {
    const task = await service.saveGeneratedTask(
      {
        originalContent: '采集商品数据。',
        targetSite: '某电商平台',
        dataFields: [{ name: '商品名称' }]
      },
      scope
    )
    const confirmed = await service.confirmTask(scope, task.id as string, {
      title: '某电商平台商品采集(每周)',
      targetSite: '某电商平台',
      targetUrl: 'https://example.com',
      crawlFrequency: 'weekly',
      deliveryFormat: 'csv',
      priority: 'high',
      assigneeName: '张三'
    })

    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.confirmedTitle).toBe('某电商平台商品采集(每周)')
    expect(confirmed.confirmedPriority).toBe('high')
    expect(confirmed.assigneeName).toBe('张三')
    expect(confirmed.confirmedAt).toBeInstanceOf(Date)
    expect(logRepository.store.some((log) => log.action === 'confirmed')).toBe(true)
  })

  it('starts a confirmed task and completes it with a summary', async () => {
    const task = await service.saveGeneratedTask(
      { originalContent: '采集商品数据。', targetSite: '某电商平台', dataFields: [{ name: '商品名称' }] },
      scope
    )
    await service.confirmTask(scope, task.id as string, {})
    const started = await service.startProcessing(scope, task.id as string)
    expect(started.status).toBe('in_progress')
    expect(started.startedAt).toBeInstanceOf(Date)

    const completed = await service.completeTask(scope, task.id as string, { completedSummary: '已采集 98 条并导出。' })
    expect(completed.status).toBe('completed')
    expect(completed.completedSummary).toBe('已采集 98 条并导出。')
    expect(logRepository.store.some((log) => log.action === 'completed')).toBe(true)
  })

  it('rejects only editable tasks and records the rejection reason', async () => {
    const task = await service.saveGeneratedTask(
      { originalContent: '采集商品数据。', targetSite: '某电商平台', dataFields: [{ name: '商品名称' }] },
      scope
    )
    const rejected = await service.rejectAndClose(scope, task.id as string, { reason: '不符合合规要求' })
    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('不符合合规要求')

    await expect(service.rejectAndClose(scope, task.id as string, { reason: 'again' })).rejects.toThrow(BadRequestException)
  })

  it('allows editing only pending or needs supplement tasks', async () => {
    const task = await service.saveGeneratedTask(
      { originalContent: '采集商品数据。', targetSite: '某电商平台', dataFields: [{ name: '商品名称' }] },
      scope
    )
    await service.confirmTask(scope, task.id as string, {})
    await expect(service.updateTask(scope, task.id as string, { title: '改标题' })).rejects.toThrow(BadRequestException)
  })

  it('saves an AI supplement draft and applies it back to pending confirmation', async () => {
    const task = await service.saveGeneratedTask(
      { originalContent: '采集商品数据。', completenessTips: ['缺少采集频率'] },
      scope
    )
    const drafted = await service.prepareSupplementDraft(scope, task.id as string, {
      supplementContent: '每周更新一次。',
      crawlFrequency: 'weekly',
      rationale: '按用户补充确定频率。'
    })
    expect(drafted.aiSupplementDraft?.crawlFrequency).toBe('weekly')
    expect(logRepository.store.some((log) => log.action === 'supplement_draft')).toBe(true)

    const saved = await service.saveSupplement(scope, task.id as string, {
      crawlFrequency: 'weekly',
      title: '某电商平台商品采集'
    })
    expect(saved.status).toBe('pending_confirmation')
    expect(saved.aiSupplementDraft).toBeNull()
  })

  it('scopes task lookup by tenant and organization', async () => {
    const task = await service.saveGeneratedTask(
      { originalContent: '采集商品数据。', targetSite: '某电商平台', dataFields: [{ name: '商品名称' }] },
      scope
    )
    await expect(
      service.getTaskDetail({ ...scope, organizationId: 'org-2' }, task.id as string)
    ).rejects.toThrow(NotFoundException)
  })

  it('returns paged view data with stats and selected detail', async () => {
    await service.saveGeneratedTask(
      { originalContent: '采集商品数据一。', targetSite: '某电商平台', dataFields: [{ name: '商品名称' }] },
      scope
    )
    const second = await service.saveGeneratedTask(
      { originalContent: '采集商品数据二。', targetSite: '某电商平台', dataFields: [{ name: '价格' }], priority: 'high' },
      scope
    )

    const viewData = await service.getViewData(scope, { taskId: second.id, page: 1, pageSize: 20 })
    expect(viewData.total).toBe(2)
    expect(viewData.items).toHaveLength(2)
    expect(viewData.item?.id).toBe(second.id)
    expect(viewData.summary.stats.pending_confirmation).toBe(2)
    expect(viewData.meta.catalog.siteTemplates.length).toBeGreaterThan(0)

    const filtered = await service.getViewData(scope, { priority: 'high' })
    expect(filtered.total).toBe(1)
  })
})
