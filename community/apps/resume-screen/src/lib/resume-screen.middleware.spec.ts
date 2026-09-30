/**
 * 简历筛选助手中间件单元测试
 *
 * 借鉴 smart-maintenance 的中间件测试模式：mock 掉 plugin-sdk 装饰器，
 * 以 jest.fn 服务桩验证 3 个工具的作用域透传、紧凑 JSON 出参与失败兜底。
 * afterAgent 轮结束兜底已随 S7 审核 F4 删除（parsing 收敛权威=队列 sweep），不再测。
 */
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target
}))

import { ResumeScreenMiddleware } from './resume-screen.middleware'
import {
  RESUME_SCREEN_DETAIL_TOOL_NAME,
  RESUME_SCREEN_LIST_TOOL_NAME,
  RESUME_SCREEN_MIDDLEWARE_NAME,
  RESUME_SCREEN_SAVE_TOOL_NAME
} from './constants'

// 构造最小可用的中间件上下文：五个业务字段进入 scope，其余为 SDK 要求的运行时占位
function createContext() {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    xpertId: 'assistant-1',
    conversationId: 'conversation-1',
    node: {} as never,
    tools: new Map(),
    runtime: {} as never
  }
}

// 服务桩：仅声明中间件实际调用的方法，避免无关桩方法残留
function createService() {
  return {
    saveCandidatesFromAgent: jest.fn(async () => [
      { id: 'c1', status: 'pending_review', name: '张三', matchScore: 86 }
    ]),
    listCandidatesForAgent: jest.fn(async () => [
      { id: 'c1', name: '张三', status: 'pending_review', matchScore: 86 },
      { id: 'c2', name: '李四', status: 'pending_review', matchScore: 40 }
    ]),
    getCandidateDetailForAgent: jest.fn(async () => ({ id: 'c1', name: '张三', status: 'pending_review' }))
  }
}

describe('ResumeScreenMiddleware', () => {
  it('exposes meta with the locked middleware name', () => {
    const middleware = new ResumeScreenMiddleware(createService() as never)
    expect(middleware.meta.name).toBe(RESUME_SCREEN_MIDDLEWARE_NAME)
  })

  it('createMiddleware returns the middleware with exactly three tools', async () => {
    const middleware = new ResumeScreenMiddleware(createService() as never)
    const instance = await middleware.createMiddleware({}, createContext() as never)
    expect(instance.name).toBe(RESUME_SCREEN_MIDDLEWARE_NAME)
    expect(instance.tools).toHaveLength(3)
    expect(instance.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining([RESUME_SCREEN_SAVE_TOOL_NAME])
    )
  })

  // v5：回填锚点从原文换成草稿行主键（原文不入库，模型侧无法再传文本）
  it('save tool persists via service and returns compact JSON', async () => {
    const service = createService()
    const middleware = new ResumeScreenMiddleware(service as never)
    const instance = await middleware.createMiddleware({}, createContext() as never)
    const saveTool = instance.tools.find((t: { name: string }) => t.name === RESUME_SCREEN_SAVE_TOOL_NAME)
    const raw = await saveTool!.invoke({
      jobId: 'job-1',
      candidates: [{ candidateId: 'c-1', name: '张三', matchScore: 86 }]
    })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(true)
    // 出参为紧凑摘要数组：每条候选人只携带 id/status/name/matchScore，原文永不回传给模型
    expect(parsed.data).toHaveLength(1)
    expect(parsed.data[0].id).toBe('c1')
    expect(parsed.data[0]).not.toHaveProperty('sourceText')
    expect(service.saveCandidatesFromAgent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', assistantId: 'assistant-1' }),
      'job-1',
      [expect.objectContaining({ candidateId: 'c-1' })]
    )
  })

  it('save tool returns failure JSON instead of throwing when service rejects', async () => {
    const service = createService()
    service.saveCandidatesFromAgent.mockRejectedValueOnce(new Error('岗位不存在'))
    const middleware = new ResumeScreenMiddleware(service as never)
    const instance = await middleware.createMiddleware({}, createContext() as never)
    const saveTool = instance.tools.find((t: { name: string }) => t.name === RESUME_SCREEN_SAVE_TOOL_NAME)
    const raw = await saveTool!.invoke({
      jobId: 'job-x',
      candidates: [{ candidateId: 'c-1' }]
    })
    const parsed = JSON.parse(raw)
    // 失败以结构化 JSON 返回给模型自行决策，而不是抛错中断对话
    expect(parsed.success).toBe(false)
    expect(parsed.message).toBe('岗位不存在')
  })

  it('list tool forwards query to service and applies minScore filter on results', async () => {
    const service = createService()
    const middleware = new ResumeScreenMiddleware(service as never)
    const instance = await middleware.createMiddleware({}, createContext() as never)
    const listTool = instance.tools.find((t: { name: string }) => t.name === RESUME_SCREEN_LIST_TOOL_NAME)
    const raw = await listTool!.invoke({ jobId: 'job-1', minScore: 50 })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(true)
    // minScore 在中间件侧过滤：86 分保留、40 分被剔除
    expect(parsed.data).toHaveLength(1)
    expect(parsed.data[0].id).toBe('c1')
    expect(service.listCandidatesForAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        assistantId: 'assistant-1',
        conversationId: 'conversation-1'
      }),
      expect.objectContaining({ jobId: 'job-1', pageSize: 10 })
    )
  })

  it('detail tool returns candidate detail via service', async () => {
    const service = createService()
    const middleware = new ResumeScreenMiddleware(service as never)
    const instance = await middleware.createMiddleware({}, createContext() as never)
    const detailTool = instance.tools.find((t: { name: string }) => t.name === RESUME_SCREEN_DETAIL_TOOL_NAME)
    const raw = await detailTool!.invoke({ candidateId: 'c1' })
    const parsed = JSON.parse(raw)
    expect(parsed.success).toBe(true)
    expect(parsed.data.id).toBe('c1')
    expect(service.getCandidateDetailForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', assistantId: 'assistant-1' }),
      'c1'
    )
  })

  // S7 审核 F4 回归钉子：中间件不再挂 afterAgent 轮结束兜底——链路 B 下该钩子唯一残留
  // 作用是误伤队列在途解析行（误标 failed + 双计 attempt），收敛权威归 sweep
  it('exposes no afterAgent hook (stale-parsing convergence belongs to the queue sweep)', async () => {
    const middleware = new ResumeScreenMiddleware(createService() as never)
    const instance = await middleware.createMiddleware({}, createContext() as never)
    expect(instance.afterAgent).toBeUndefined()
  })
})
