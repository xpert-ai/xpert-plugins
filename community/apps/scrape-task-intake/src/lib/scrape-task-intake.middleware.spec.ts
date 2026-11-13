jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target
}))

import { ScrapeTaskIntakeMiddleware } from './scrape-task-intake.middleware'

const SCRAPE_TASK_INTAKE_TOOL_NAMES = [
  'scrape_intake_save_generated_task',
  'scrape_intake_get_catalog',
  'scrape_intake_search_tasks',
  'scrape_intake_get_task_detail',
  'scrape_intake_prepare_supplement_draft'
]

describe('ScrapeTaskIntakeMiddleware', () => {
  function createMiddleware(service: Record<string, jest.Mock>) {
    const middleware = new ScrapeTaskIntakeMiddleware(service as never)
    return middleware.createMiddleware(
      {},
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        xpertId: 'assistant-1',
        node: {} as never,
        tools: new Map(),
        runtime: {} as never
      }
    )
  }

  it('exposes the scrape task intake business tools', async () => {
    const service = {
      saveGeneratedTask: jest.fn(async () => ({
        id: 'task-1',
        taskNo: 'ST-20260916-0001',
        status: 'pending_confirmation',
        title: '某电商平台商品采集',
        dataFields: [{ name: '商品名称' }],
        logs: []
      })),
      getCatalog: jest.fn(() => ({ siteTemplates: [] })),
      searchTasks: jest.fn(async () => ({ items: [], total: 0 })),
      getTaskDetailForAgent: jest.fn(async () => ({ id: 'task-1', logs: [] })),
      prepareSupplementDraft: jest.fn(async () => ({ id: 'task-1', aiSupplementDraft: {} }))
    }
    const result = await createMiddleware(service)

    expect(result.tools.map((item) => item.name)).toEqual(SCRAPE_TASK_INTAKE_TOOL_NAMES)
  })

  it('invokes catalog, search, detail and supplement draft tools with scoped service methods', async () => {
    const service = {
      saveGeneratedTask: jest.fn(async () => ({
        id: 'task-1',
        taskNo: 'ST-20260916-0001',
        status: 'pending_confirmation',
        title: '某电商平台商品采集',
        dataFields: [{ name: '商品名称' }],
        completenessTips: [],
        aiConfidence: 0.9,
        logs: []
      })),
      getCatalog: jest.fn(() => ({ siteTemplates: [{ key: 'ecommerce_product', name: '电商商品页' }] })),
      searchTasks: jest.fn(async () => ({ items: [{ id: 'task-1', taskNo: 'ST-20260916-0001' }], total: 1 })),
      getTaskDetailForAgent: jest.fn(async () => ({ id: 'task-1', taskNo: 'ST-20260916-0001', logs: [] })),
      prepareSupplementDraft: jest.fn(async () => ({
        id: 'task-1',
        taskNo: 'ST-20260916-0001',
        status: 'needs_supplement',
        aiSupplementDraft: { crawlFrequency: 'weekly' }
      }))
    }
    const result = await createMiddleware(service)

    const tools = new Map(result.tools.map((item) => [item.name, item]))
    const catalog = await tools.get('scrape_intake_get_catalog')?.invoke({})
    expect(JSON.parse(catalog as string).success).toBe(true)

    const search = await tools.get('scrape_intake_search_tasks')?.invoke({ status: 'pending_confirmation', page: 1 })
    const searchPayload = JSON.parse(search as string)
    expect(searchPayload.success).toBe(true)
    expect(searchPayload.data.total).toBe(1)

    const detail = await tools.get('scrape_intake_get_task_detail')?.invoke({ taskId: 'task-1' })
    const detailPayload = JSON.parse(detail as string)
    expect(detailPayload.data.taskNo).toBe('ST-20260916-0001')

    const draft = await tools.get('scrape_intake_prepare_supplement_draft')?.invoke({
      taskId: 'task-1',
      supplementContent: '每周更新',
      crawlFrequency: 'weekly'
    })
    const draftPayload = JSON.parse(draft as string)
    expect(draftPayload.data.aiSupplementDraft.crawlFrequency).toBe('weekly')
  })

  it('saves a generated task with the request scope from the middleware context', async () => {
    const saveGeneratedTask = jest.fn(async () => ({
      id: 'task-1',
      taskNo: 'ST-20260916-0001',
      status: 'pending_confirmation',
      title: '某电商平台商品采集',
      targetSite: '某电商平台',
      dataFields: [{ name: '商品名称' }],
      logs: []
    }))
    const result = await createMiddleware({ saveGeneratedTask })

    const tools = new Map(result.tools.map((item) => [item.name, item]))
    const output = await tools.get('scrape_intake_save_generated_task')?.invoke({
      originalContent: '采集某电商平台商品名称和价格。',
      targetSite: '某电商平台',
      dataFields: [{ name: '商品名称' }, { name: '价格' }]
    })
    const payload = JSON.parse(output as string)
    expect(payload.success).toBe(true)
    expect(payload.data.taskNo).toBe('ST-20260916-0001')
    expect(saveGeneratedTask).toHaveBeenCalledWith(
      expect.objectContaining({ originalContent: '采集某电商平台商品名称和价格。' }),
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        assistantId: 'assistant-1',
        conversationId: 'conversation-1'
      })
    )
  })
})
