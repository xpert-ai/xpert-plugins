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
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  renderRemoteReactIframeHtml: (input: { title: string; appScript: string }) =>
    `<!doctype html><html><body><h1>${input.title}</h1><script>${input.appScript}</script></body></html>`
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  // 上传解析入队协作件：本 describe 只走非文件动作，给个空实现满足构造参数即可
  const noopIntakeQueue = { enqueueParse: jest.fn(async () => undefined) }

  const provider = new ResumeScreenViewProvider(service as never, noopIntakeQueue as never)

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
    const providerWithActions = new ResumeScreenViewProvider(fullService as never, noopIntakeQueue as never)

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

  // 文件上传通道：服务端解析出文本 → 落 parsing 草稿行 → 入队解析（spec v2.2 链路 B 插件侧地基）
  describe('executeViewFileAction (upload_resume_files)', () => {
    const docxFixture = readFileSync(join(__dirname, '__fixtures__', 'resume-minimal.docx'))
    const emptyPdfFixture = readFileSync(join(__dirname, '__fixtures__', 'resume-empty.pdf'))

    let uploadService: { prepareIntakeDraft: jest.Mock }
    let intakeQueue: { enqueueParse: jest.Mock }
    let uploadProvider: ResumeScreenViewProvider

    beforeEach(() => {
      uploadService = {
        prepareIntakeDraft: jest.fn(async () => ({
          jobId: 'job-1',
          created: [{ id: 'c1', status: 'parsing', attemptCount: 0, sourceFileName: '张三.docx' }],
          skippedAsExisting: []
        }))
      }
      intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
      uploadProvider = new ResumeScreenViewProvider(uploadService as never, intakeQueue as never)
    })

    // 视图态 jobId 走宿主 query-parameters 通道（P5），文件动作请求同样携带 request.parameters
    const fileRequest = { parameters: { jobId: 'job-1' } } as never

    it('upload action: parses file, persists draft row with source name and enqueues parse', async () => {
      const file = {
        buffer: docxFixture,
        originalname: '张三.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: docxFixture.length
      } as never
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'upload_resume_files',
        fileRequest,
        file
      )
      expect(res).toMatchObject({ success: true, refresh: true })
      // 解析文本是 sourceText 唯一来源，文件名随 options 落库
      const [scope, jobId, texts, options] = uploadService.prepareIntakeDraft.mock.calls[0]
      expect(scope).toMatchObject({ tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' })
      expect(jobId).toBe('job-1')
      expect(texts[0]).toContain('张三')
      expect(options).toEqual({ sourceFileName: '张三.docx' })
      expect(res.data).toMatchObject({ sourceFileName: '张三.docx' })
      expect(intakeQueue.enqueueParse).toHaveBeenCalledTimes(1)
      expect(intakeQueue.enqueueParse).toHaveBeenCalledWith(
        expect.objectContaining({ candidateId: 'c1', attemptCount: 0, tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' })
      )
    })

    it('upload action: parse failure returns success:false with reason and creates nothing', async () => {
      const file = { buffer: emptyPdfFixture, originalname: 'scan.pdf', size: emptyPdfFixture.length } as never
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'upload_resume_files',
        fileRequest,
        file
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('转存为 Word')
      expect(uploadService.prepareIntakeDraft).not.toHaveBeenCalled()
      expect(intakeQueue.enqueueParse).not.toHaveBeenCalled()
    })

    it('upload action: missing jobId parameter fails before touching the file', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'upload_resume_files',
        {} as never,
        { buffer: docxFixture, originalname: '张三.docx' } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('请先选择岗位')
      expect(uploadService.prepareIntakeDraft).not.toHaveBeenCalled()
    })

    it('upload action: unknown action key is rejected', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'download_everything',
        fileRequest,
        { buffer: docxFixture, originalname: '张三.docx' } as never
      )
      expect(res).toMatchObject({ success: false })
    })

    it('upload action: enqueue failure surfaces as readable failure (row stays parsing for sweep)', async () => {
      intakeQueue.enqueueParse.mockRejectedValueOnce(new Error('redis down'))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'upload_resume_files',
        fileRequest,
        { buffer: docxFixture, originalname: '张三.docx' } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('redis down')
    })
  })
})
