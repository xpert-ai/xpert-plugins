/**
 * 简历筛选视图提供者单元测试
 *
 * 以 jest.fn 模拟 ResumeScreenService，验证 manifest 只在工作台主槽位发布、
 * 视图数据按上下文作用域委托服务查询；manifest 字段结构与真实平台的
 * 合规性由 harness 加载与真机部署验证兜底。
 */
// mock SDK：plugin-sdk 全量引入依赖 lodash-es 等 ESM 产物，jest(CommonJS) 无法解析；
// 被测代码只使用装饰器与渲染壳函数，此处按行为等价替换（对齐 smart-maintenance 样板）
jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: (input: { title: string; appScript: string }) =>
    `<!doctype html><html><body><h1>${input.title}</h1><script>${input.appScript}</script></body></html>`
}))

import { ResumeScreenViewProvider } from './resume-screen-view.provider'
import { RESUME_SCREEN_WORKBENCH_VIEW_KEY } from './constants'
import type { ResumeScreenScope, ResumeScreenViewData } from './types'

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    hostType: 'agent',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    xpertId: 'assistant-1',
    conversationId: 'conversation-1',
    ...overrides
  } as never
}

describe('ResumeScreenViewProvider', () => {
  const viewData: ResumeScreenViewData = {
    jobs: [],
    candidates: [],
    stats: { total: 0, pendingReview: 0, accepted: 0, hold: 0, rejected: 0, failed: 0, parsing: 0 },
    page: { number: 1, size: 20, total: 0 }
  }

  const service = {
    getViewData: jest.fn(async (_scope: ResumeScreenScope) => viewData)
  }

  const provider = new ResumeScreenViewProvider(service as never)

  it('supports agent host only', () => {
    expect(provider.supports(createContext({ hostType: 'agent' }))).toBe(true)
    expect(provider.supports(createContext({ hostType: 'other' }))).toBe(false)
  })

  it('returns one manifest only for the workbench main slot', () => {
    const manifests = provider.getViewManifests(createContext(), 'agent.workbench.main')
    expect(manifests).toHaveLength(1)
    expect(manifests[0].key).toBe(RESUME_SCREEN_WORKBENCH_VIEW_KEY)
    expect(manifests[0].refreshable).toBe(true)

    expect(provider.getViewManifests(createContext(), 'other.slot')).toEqual([])
  })

  it('getViewData delegates to the service with scope from context', async () => {
    const result = await provider.getViewData(
      createContext(),
      RESUME_SCREEN_WORKBENCH_VIEW_KEY,
      {} as never
    )
    expect(service.getViewData).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', assistantId: 'assistant-1' }),
      expect.anything()
    )
    expect(result).toBe(viewData as never)
  })

  it('returns empty object for unknown view keys', async () => {
    const result = await provider.getViewData(createContext(), 'unknown', {} as never)
    expect(result).toEqual({})
  })
})
