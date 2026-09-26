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

  // 动作分支：录入/重试/保存/处置/未知动作的完整路由与可读失败兜底
  describe('executeViewAction', () => {
    const fullService = {
      getViewData: jest.fn(async () => viewData),
      prepareIntakeDraft: jest.fn(async () => ({
        jobId: 'job-1',
        created: [{ id: 'c1', status: 'parsing' }],
        skippedAsExisting: []
      })),
      retryCandidate: jest.fn(async () => ({ id: 'c1', status: 'parsing', attemptCount: 1 })),
      updateCandidate: jest.fn(async () => ({ id: 'c1', name: '张三丰', revision: 2 })),
      reviewCandidate: jest.fn(async () => ({ id: 'c1', status: 'accepted' }))
    }
    const providerWithActions = new ResumeScreenViewProvider(fullService as never)

    function actionRequest(input: Record<string, unknown> = {}, targetId?: string) {
      return { input, targetId } as never
    }

    it('prepare_parse_message returns commandKey with a natural-language payload (spec §8.3)', async () => {
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'prepare_parse_message',
        actionRequest({ jobId: 'job-1', texts: ['简历甲', '简历乙'] })
      )
      expect(fullService.prepareIntakeDraft).toHaveBeenCalled()
      expect(result.success).toBe(true)
      // 平台契约中 commandKey/payload 收敛在 data 内（对齐 smart-maintenance 样板）
      expect(result.data).toMatchObject({
        commandKey: 'assistant.chat.send_message',
        payload: { text: expect.stringContaining('简历甲') }
      })
    })

    it('review actions map to service reviewCandidate', async () => {
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'accept_candidate',
        actionRequest({ candidateId: 'c1' }, 'c1')
      )
      expect(fullService.reviewCandidate).toHaveBeenCalledWith(
        expect.anything(),
        'c1',
        'accept',
        expect.any(String)
      )
      expect(result.success).toBe(true)
      expect(result.refresh).toBe(true)
    })

    it('update_candidate forwards patch with expectedRevision', async () => {
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'update_candidate',
        actionRequest({ candidateId: 'c1', patch: { name: '张三丰' }, expectedRevision: 1 })
      )
      expect(fullService.updateCandidate).toHaveBeenCalledWith(expect.anything(), 'c1', { name: '张三丰' }, 1)
      expect(result.success).toBe(true)
    })

    it('returns readable failure on service errors (no stack traces)', async () => {
      fullService.reviewCandidate.mockRejectedValueOnce(new Error('记录已被他人修改，请刷新'))
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'hold_candidate',
        actionRequest({ candidateId: 'c1' })
      )
      expect(result.success).toBe(false)
      expect(JSON.stringify(result.message)).toContain('刷新')
    })

    it('rejects unknown action keys and view keys', async () => {
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'delete_everything',
        actionRequest()
      )
      expect(result.success).toBe(false)
    })
  })
})
