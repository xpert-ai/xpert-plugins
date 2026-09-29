/**
 * 简历筛选视图提供者单元测试
 *
 * 以 jest.fn 模拟 ResumeScreenService，验证 manifest 在 main/fixed 双槽发布
 * （v2.4/v4.3 槽位模型：运行时对话只查询 fixed 槽）、
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
import { ResumeScreenRevisionConflictError } from './resume-screen.service'
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

  // 双槽注册（Task 33）：main 供 studio 中间件面板消费、fixed 供运行时用户对话开 tab；
  // 仅 fixed 变体附加 workbench:{fixed,menu}，两槽 activation 均须保留（宿主 policy=requireFeatureActivation）
  it('returns the workbench manifest for both main and fixed slots with fixed-only workbench descriptor', () => {
    const mainManifests = provider.getViewManifests(createContext(), 'agent.workbench.main')
    expect(mainManifests).toHaveLength(1)
    expect(mainManifests[0].key).toBe(RESUME_SCREEN_WORKBENCH_VIEW_KEY)
    expect(mainManifests[0].refreshable).toBe(true)

    const fixedManifests = provider.getViewManifests(createContext(), 'agent.workbench.fixed')
    expect(fixedManifests).toHaveLength(1)
    expect(fixedManifests[0].key).toBe(RESUME_SCREEN_WORKBENCH_VIEW_KEY)

    const { workbench: mainWorkbench, slot: mainSlot, ...mainRest } = mainManifests[0]
    const { workbench: fixedWorkbench, slot: fixedSlot, ...fixedRest } = fixedManifests[0]
    expect(mainSlot).toBe('agent.workbench.main')
    expect(fixedSlot).toBe('agent.workbench.fixed')
    // main 变体保持现状：无 workbench 字段
    expect(mainWorkbench).toBeUndefined()
    // fixed 变体附加置顶菜单注册描述符
    expect(fixedWorkbench).toEqual({
      fixed: true,
      menu: {
        enabled: true,
        label: { en_US: 'Resume Screening', zh_Hans: '简历初筛' },
        order: 20,
        icon: { type: 'font', value: 'ri-file-user-line', color: '#1d4ed8' }
      }
    })
    // 两槽 activation 原样保留，删了会被宿主第一分支直接拒
    expect(mainManifests[0].activation).toEqual({ requiredFeatures: ['resume_screen'] })
    expect(fixedManifests[0].activation).toEqual({ requiredFeatures: ['resume_screen'] })
    // 除 slot/workbench 外两变体 manifest 逐字段一致，防止复制分叉
    expect(fixedRest).toEqual(mainRest)

    expect(provider.getViewManifests(createContext(), 'other.slot')).toEqual([])
  })

  // 动作目标态（Task 30）：上传/新建岗位入列、prepare_parse_message 出列（录入统一走文件通道）
  it('manifest actions carry upload/create_job and drop prepare_parse_message', () => {
    const manifest = provider.getViewManifests(createContext(), 'agent.workbench.main')[0]
    const byKey = new Map((manifest.actions ?? []).map((action) => [action.key, action]))

    // 上传动作必须显式声明 transport=file：平台按 manifest 校验，缺声明会直接拒绝文件动作
    expect(byKey.get('upload_resume_files')).toMatchObject({
      actionType: 'invoke',
      transport: 'file',
      placement: 'toolbar',
      icon: 'ri-upload-cloud-line'
    })
    expect(byKey.get('create_job')).toMatchObject({ actionType: 'invoke', placement: 'toolbar', icon: 'ri-add-line' })
    // v5 预览动作：invoke 通道（base64/html 走 action 回执，不走文件下载通道）
    // 契约的 transport 只有 'json'|'file'，本动作刻意不声明——所以这里钉的是「不等于 file」
    expect(byKey.get('preview_candidate')).toMatchObject({
      actionType: 'invoke',
      icon: 'ri-file-search-line',
      placement: 'toolbar'
    })
    expect(byKey.get('preview_candidate')?.transport).toBeUndefined()
    expect(byKey.has('prepare_parse_message')).toBe(false)
    // 其余动作原样保留（刷新/重试/保存/处置四组 + 新建岗位）
    for (const key of ['refresh', 'retry_candidate', 'update_candidate', 'accept_candidate', 'hold_candidate', 'reject_candidate', 'reset_candidate', 'create_job']) {
      expect(byKey.has(key)).toBe(true)
    }
    // 对话旁路保留：clientCommands 仍供视图向助手发消息
    expect(manifest.clientCommands).toHaveLength(1)
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

  // 动作分支：新建岗位/重试入队/保存/处置/未知动作的完整路由与可读失败兜底
  describe('executeViewAction', () => {
    const fullService = {
      getViewData: jest.fn(async () => viewData),
      // jdHash 幂等由 service 自身保证（service.spec 已钉「同文 JD 返回既有岗位」），
      // 这里固定返回同 id 视图，钉住视图层对重复创建照常 success
      createJob: jest.fn(async () => ({ id: 'job-9', title: '岗位', jdText: 'x'.repeat(40) })),
      retryCandidate: jest.fn(async () => ({ id: 'c1', status: 'parsing', attemptCount: 1, revision: 2 })),
      updateCandidate: jest.fn(async () => ({ id: 'c1', name: '张三丰', revision: 2 })),
      reviewCandidate: jest.fn(async () => ({ id: 'c1', status: 'accepted' }))
    }
    const providerWithActions = new ResumeScreenViewProvider(fullService as never, noopIntakeQueue as never)

    function actionRequest(input: Record<string, unknown> = {}, targetId?: string) {
      return { input, targetId } as never
    }

    it('create_job trims input, delegates to service.createJob and returns the job view', async () => {
      const jdText = `golang 高并发经验 ${'y'.repeat(40)}`
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'create_job',
        actionRequest({ title: '  后端工程师  ', jdText })
      )
      expect(fullService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', assistantId: 'assistant-1' }),
        { title: '后端工程师', jdText }
      )
      expect(result.success).toBe(true)
      expect(result.refresh).toBe(true)
      expect(result.data).toMatchObject({ job: { id: 'job-9' } })
    })

    it('create_job rejects blank title or short jdText without touching the service', async () => {
      fullService.createJob.mockClear()
      const short = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'create_job',
        actionRequest({ title: 'A', jdText: 'x'.repeat(29) })
      )
      expect(short.success).toBe(false)
      expect(JSON.stringify(short.message)).toContain('JD 不少于 30 字')
      const blank = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'create_job',
        actionRequest({ title: '   ', jdText: 'x'.repeat(40) })
      )
      expect(blank.success).toBe(false)
      expect(fullService.createJob).not.toHaveBeenCalled()
    })

    it('create_job keeps success on duplicate title+jdText (service returns the existing job, same id)', async () => {
      // service 的 jdHash 幂等语义：重复提交返回既有岗位而不是报错，视图层原样透传
      const first = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'create_job',
        actionRequest({ title: 'A', jdText: 'x'.repeat(40) })
      )
      const second = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'create_job',
        actionRequest({ title: 'A', jdText: 'x'.repeat(40) })
      )
      expect(second.success).toBe(true)
      expect((second.data as { job: { id: string } }).job.id).toBe((first.data as { job: { id: string } }).job.id)
    })

    it('retry_candidate resets via service then enqueues with a retry-generation suffix away from the first jobId', async () => {
      // 队列化重试（链路 B）：首投失败链里 markCandidateFailed 已把 attemptCount 持久 +1，
      // 重试读当前值（1）+ r{revision} 后缀 → jobId resume-parse-c1-1-r2，与首投 resume-parse-c1-0
      // （可能仍以 failed 存活于 Redis 7d）天然变号，不会被 BullMQ 静默去重（F5）。
      const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
      const retryProvider = new ResumeScreenViewProvider(fullService as never, intakeQueue as never)
      const result = await retryProvider.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'retry_candidate',
        actionRequest({ candidateId: 'c1' }, 'c1')
      )
      expect(fullService.retryCandidate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }), 'c1')
      expect(intakeQueue.enqueueParse).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'c1',
          attemptCount: 1,
          jobSuffix: 'r2',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          userId: 'user-1'
        })
      )
      expect(result).toMatchObject({ success: true, refresh: true })
      // 不再走对话指令旁路：重试直接入队，回执只带行状态
      expect(result.data).toMatchObject({ id: 'c1', status: 'parsing' })
      expect(JSON.stringify(result.data ?? {})).not.toContain('commandKey')
    })

    it('retry_candidate on the same generation collapses into one queued job (idempotent benefit, no guard needed)', async () => {
      // 对同一 parsing 行连点重试：attemptCount/revision 不变 → jobId 相同 → BullMQ 去重
      // 不重复投递，等待中不重复投是幂等收益，无需设防（M8' 审查裁定）
      const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
      const retryProvider = new ResumeScreenViewProvider(fullService as never, intakeQueue as never)
      await retryProvider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'retry_candidate', actionRequest({ candidateId: 'c1' }, 'c1')
      )
      await retryProvider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'retry_candidate', actionRequest({ candidateId: 'c1' }, 'c1')
      )
      const stamps = intakeQueue.enqueueParse.mock.calls.map((call) => `${call[0].attemptCount}-${call[0].jobSuffix}`)
      expect(stamps).toEqual(['1-r2', '1-r2'])
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

    // S7 审核 F1：非法/缺失 expectedRevision 直接失败回执——不得默认成 1 代打，
    // 否则调用方丢版本号的缺陷会被伪装成正常保存并可能覆盖他人新版本
    it('update_candidate refuses invalid expectedRevision without touching the service', async () => {
      fullService.updateCandidate.mockClear()
      for (const bad of [undefined, 'abc', 1.5, 0, null]) {
        const result = await providerWithActions.executeViewAction(
          createContext(),
          RESUME_SCREEN_WORKBENCH_VIEW_KEY,
          'update_candidate',
          actionRequest({ candidateId: 'c1', patch: { name: '张三丰' }, expectedRevision: bad })
        )
        expect(result.success).toBe(false)
      }
      expect(fullService.updateCandidate).not.toHaveBeenCalled()
    })

    // S7 审核 F5：乐观锁冲突失败回执携带机读 code，前端按结构化标记判定而不是中文文案
    it('update_candidate conflict receipt carries the machine-readable revision_conflict code', async () => {
      fullService.updateCandidate.mockRejectedValueOnce(new ResumeScreenRevisionConflictError())
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'update_candidate',
        actionRequest({ candidateId: 'c1', patch: { name: '张三丰' }, expectedRevision: 7 })
      )
      expect(result.success).toBe(false)
      expect(result.data).toEqual({ code: 'revision_conflict' })
      expect(JSON.stringify(result.message)).toContain('记录已被他人修改，请刷新')
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

    it('prepare_parse_message is retired: paste-to-chat intake no longer accepted', async () => {
      const result = await providerWithActions.executeViewAction(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'prepare_parse_message',
        actionRequest({ jobId: 'job-1', texts: ['简历甲'] })
      )
      expect(result.success).toBe(false)
    })
  })

  // v5 上传通道：请求内不再解析文本，只做「校验 → 落盘 → 建 draft 行 → 置 parsing → 入队」
  describe('executeViewFileAction (upload_resume_files)', () => {
    const docxFixture = readFileSync(join(__dirname, '__fixtures__', 'resume-minimal.docx'))
    const junkPdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.from('junk')])

    // DOCX/PDF 的标准 MIME：store 桩按 fileName 后缀回写，与 ResumeFileStore.KIND_TO_MIME 同口径
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const PDF_MIME = 'application/pdf'

    let uploadService: {
      prepareIntakeDraft: jest.Mock
      markCandidateParsing: jest.Mock
      markCandidateFailed: jest.Mock
      fileStore: { put: jest.Mock }
    }
    let intakeQueue: { enqueueParse: jest.Mock }
    let uploadProvider: ResumeScreenViewProvider

    beforeEach(() => {
      uploadService = {
        prepareIntakeDraft: jest.fn(async (_scope: unknown, _jobId: string, files: Array<{ sourceFileName: string }>) => ({
          jobId: 'job-1',
          created: files.map((_, index) => ({ id: `c${index + 1}`, status: 'draft', attemptCount: 0, revision: 1, hasFile: true })),
          skippedAsExisting: []
        })),
        markCandidateParsing: jest.fn(async () => ({ id: 'c1', status: 'parsing' })),
        markCandidateFailed: jest.fn(async () => undefined),
        // 桩刻意复刻真实 key 不变量：`{yyyy-MM-dd}/{sha256 前 16 位}.{ext}` 单段、无第二段、
        // 永不拼接用户文件名（越界防护与内容寻址幂等都挂在这条上）；mime 随后缀走，
        // 不能固定返回 pdf，否则会把「上传 docx 却回执 pdf」钉成契约。
        // 校验顺序也照抄真实实现（体积闸 → detectResumeFileKind 类型闸 → 写盘）：
        // 非法字节一律零写入，所以伪装后缀在这里抛出「扩展名不符」。
        // 注意桩的 mime 按「文件名后缀」给，而真实实现按魔数复核后的 kind 给：两者在
        // 「伪装 pdf」这类输入上必然不同，用来钉住 provider 的描述符只认自己判定的 kind
        fileStore: {
          put: jest.fn(async ({ buffer, fileName }: { buffer: Buffer; fileName: string }) => {
            if (buffer.length > 10 * 1024 * 1024) {
              throw new Error('文件超过 10MB 上限，请压缩或拆分后重新上传')
            }
            const lower = fileName.toLowerCase()
            const head = buffer.subarray(0, 5).toString('latin1')
            if (lower.endsWith('.docx') && !head.startsWith('PK')) {
              throw new Error('文件内容与 .docx 扩展名不符')
            }
            if (lower.endsWith('.pdf') && !head.startsWith('%PDF-')) {
              throw new Error('文件内容与 .pdf 扩展名不符')
            }
            if (!lower.endsWith('.docx') && !lower.endsWith('.pdf')) {
              throw new Error('仅支持 .docx / .pdf 文件')
            }
            return {
              key: `2026-09-29/${lower.endsWith('.pdf') ? '951b13649f7bc2db.pdf' : '153b80d355c9fe86.docx'}`,
              absolutePath: '/var/xpert/resume/2026-09-29/153b80d355c9fe86.docx',
              size: buffer.length,
              sha256: 'a'.repeat(64),
              mime: lower.endsWith('.pdf') ? PDF_MIME : DOCX_MIME
            }
          })
        }
      }
      intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
      uploadProvider = new ResumeScreenViewProvider(uploadService as never, intakeQueue as never)
    })

    // 视图态 jobId 走宿主 query-parameters 通道（P5），文件动作请求同样携带 request.parameters
    const fileRequest = { parameters: { jobId: 'job-1' } } as never

    it('落盘 → 建行 → 置 parsing → 入队，回执结构与 v4 保持一致（spec §3.6）', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'upload_resume_files',
        fileRequest,
        { buffer: docxFixture, originalname: '张三-简历.docx', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: true, refresh: true })
      // R-P56：回执结构与 v4 一致，skipped 必须是**文件名字符串数组**而不是计数——
      // 前端 workbench.tsx 以 Array.isArray(data.skipped) 判空标「跳过」行，下发数字会让
      // 重复上传的简历被静默标成「已创建」。无命中判重时也要显式钉住空数组，禁止 undefined 蒙过。
      expect(res.data).toEqual({
        fileName: '张三-简历.docx',
        sourceFileName: '张三-简历.docx',
        created: [{ id: 'c1', status: 'draft' }],
        skipped: []
      })
      // 描述符四要素来自 store 回执，逐文件携带文件名（不再有整批同名口径）
      expect(uploadService.prepareIntakeDraft.mock.calls[0][2]).toEqual([
        { key: '2026-09-29/153b80d355c9fe86.docx', size: docxFixture.length, sha256: 'a'.repeat(64), mime: DOCX_MIME, sourceFileName: '张三-简历.docx' }
      ])
      expect(uploadService.markCandidateParsing).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }), 'c1')
      expect(intakeQueue.enqueueParse).toHaveBeenCalledWith(
        expect.objectContaining({ candidateId: 'c1', attemptCount: 0, tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' })
      )
    })

    it('重复上传命中判重时，回执 skipped 原样下发文件名数组（不是计数、不是哈希）', async () => {
      // service 侧语义已按文件名数组钉死（T8 评审要求），本用例钉住 provider 不做任何形态转换：
      // 前端 workbench.tsx 靠 Array.isArray(data.skipped) + length>0 把该行标成「跳过（内容已存在）」，
      // 一旦下发计数，重复上传的简历会被静默标成「已创建」——用户可见缺陷（R-P56）。
      uploadService.prepareIntakeDraft.mockImplementationOnce(async () => ({
        jobId: 'job-1',
        created: [],
        skippedAsExisting: ['李四-简历.docx']
      }))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(),
        RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        'upload_resume_files',
        fileRequest,
        { buffer: docxFixture, originalname: '李四-简历.docx', size: docxFixture.length } as never
      )
      expect(res.data).toEqual({
        fileName: '李四-简历.docx',
        sourceFileName: '李四-简历.docx',
        created: [],
        skipped: ['李四-简历.docx']
      })
      // 命中判重时不应再置 parsing / 入队：没有任何新建行可推进
      expect(uploadService.markCandidateParsing).not.toHaveBeenCalled()
      expect(intakeQueue.enqueueParse).not.toHaveBeenCalled()
    })

    it('内部存储 key 与绝对路径不出现在上传回执里（红线：filePath 不下发浏览器）', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: '张三.docx', size: docxFixture.length } as never
      )
      const receipt = JSON.stringify(res.data)
      expect(receipt).not.toContain('2026-09-29/')
      expect(receipt).not.toContain('/var/xpert/resume')
      expect(receipt).not.toContain('a'.repeat(64))
    })

    it('请求内不再解析文本（扫描件照常落盘建行，字节原样交 store）', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: junkPdf, originalname: 'scan.pdf', size: junkPdf.length } as never
      )
      // 扫描件在 v4 会当场报 no_text_layer；v5 必须照常落盘建行（解析推迟到任务期）
      expect(res).toMatchObject({ success: true })
      expect((res.data as { created: Array<{ status: string }> }).created[0].status).toBe('draft')
      expect(uploadService.fileStore.put).toHaveBeenCalledTimes(1)
      expect(uploadService.prepareIntakeDraft).toHaveBeenCalledTimes(1)
    })

    it('超过 10MB 的文件在落盘前拒绝，不建行不入队', async () => {
      const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
      big.write('%PDF-1.7', 0)
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: big, originalname: 'big.pdf', size: big.length } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('10MB')
      expect(uploadService.fileStore.put).not.toHaveBeenCalled()
      expect(uploadService.prepareIntakeDraft).not.toHaveBeenCalled()
    })

    it('扩展名与内容不符（伪装 pdf）拒绝并给可读原因', async () => {
      // 桩在此处放宽为「只认后缀」：既能走到拒绝分支，也让 store 返回的 mime 与本层
      // kind 判定结果可区分——描述符若错信 store 的 mime，docx 会被记成 pdf 而选错预览分支
      uploadService.fileStore.put.mockImplementationOnce(async () => ({
        key: '2026-09-29/951b13649f7bc2db.pdf',
        absolutePath: '/var/xpert/resume/2026-09-29/951b13649f7bc2db.pdf',
        size: docxFixture.length,
        sha256: 'a'.repeat(64),
        mime: PDF_MIME
      }))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: 'fake.pdf', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('扩展名不符')
      // 类型校验与落盘同处 store（其校验先于写盘，非法字节零写入），
      // 本层可观测的收敛点是「不建行、不入队」
      expect(uploadService.prepareIntakeDraft).not.toHaveBeenCalled()
      expect(intakeQueue.enqueueParse).not.toHaveBeenCalled()
    })

    it('描述符 mime 由本层 kind 判定给出，不采信存储回执的后缀推断', async () => {
      // 上传真实 docx，但桩按后缀给 pdf mime：只有本层自己判定的 kind 才能产出正确 mime
      uploadService.fileStore.put.mockImplementationOnce(async () => ({
        key: '2026-09-29/951b13649f7bc2db.pdf',
        absolutePath: '/var/xpert/resume/2026-09-29/951b13649f7bc2db.pdf',
        size: docxFixture.length,
        sha256: 'a'.repeat(64),
        mime: PDF_MIME
      }))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: 'resume.docx', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: true })
      expect(uploadService.prepareIntakeDraft.mock.calls[0][2][0].mime).toBe(DOCX_MIME)
    })

    it('非 .docx/.pdf 扩展名直接拒绝', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: Buffer.from('hello'), originalname: 'resume.txt', size: 5 } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('docx')
      expect(uploadService.prepareIntakeDraft).not.toHaveBeenCalled()
    })

    it('store 给出的 key 只用于入库，绝不回显到上传回执（即便存储实现分叉）', async () => {
      // 恶意/异常 store 桩：key 里带上用户文件名与第二段——provider 不得据此拼装任何展示字段，
      // 也不得把 absolutePath 透出；这条守的是「回执不含内部路径」红线本身，与 store 实现无关
      uploadService.fileStore.put.mockImplementationOnce(async ({ fileName }: { fileName: string }) => ({
        key: `2026-09-29/hash-${fileName}/secret.docx`,
        absolutePath: '/var/xpert/resume/2026-09-29/hash-张三.docx',
        size: 20480,
        sha256: 'a'.repeat(64),
        mime: DOCX_MIME
      }))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: '张三.docx', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: true })
      expect(uploadService.prepareIntakeDraft.mock.calls[0][2][0].key).toBe('2026-09-29/hash-张三.docx/secret.docx')
      expect(JSON.stringify(res.data)).not.toContain('2026-09-29/')
      expect(JSON.stringify(res.data)).not.toContain('/var/xpert/resume')
    })

    it('空字节拒绝，不落盘', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: Buffer.alloc(0), originalname: 'a.docx', size: 0 } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(uploadService.fileStore.put).not.toHaveBeenCalled()
    })

    it('建行失败时回报可读原因，不入队（已落盘字节由目录日期清理兜底）', async () => {
      uploadService.prepareIntakeDraft.mockRejectedValueOnce(new Error('岗位不存在'))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: '张三.docx', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('岗位不存在')
      expect(intakeQueue.enqueueParse).not.toHaveBeenCalled()
      expect(uploadService.markCandidateParsing).not.toHaveBeenCalled()
    })

    it('入队失败时把行收敛为 failed，让工作台出现可重试入口（不留 parsing 黑洞）', async () => {
      intakeQueue.enqueueParse.mockRejectedValueOnce(new Error('redis down'))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: '张三.docx', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('redis down')
      // 收敛动作必须带业务原因落库：draft 行不会被 sweep 捞（sweep 只扫 parsing），
      // 只有 failed 才在工作台暴露重试入口
      expect(uploadService.markCandidateFailed).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1' }),
        'c1',
        expect.stringContaining('解析任务入队失败：redis down')
      )
    })

    it('首行入队失败即中断，不再投递后续候选人（避免半批入队的不可解释状态）', async () => {
      uploadService.prepareIntakeDraft.mockImplementationOnce(async (_scope: unknown, _jobId: string, files: Array<{ sourceFileName: string }>) => ({
        jobId: 'job-1',
        created: files.map((_, index) => ({ id: `c${index + 1}`, status: 'draft', attemptCount: 0, revision: 1, hasFile: true })),
        skippedAsExisting: []
      }))
      intakeQueue.enqueueParse.mockRejectedValueOnce(new Error('redis down'))
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', fileRequest,
        { buffer: docxFixture, originalname: '张三.docx', size: docxFixture.length } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(intakeQueue.enqueueParse).toHaveBeenCalledTimes(1)
      expect(uploadService.markCandidateFailed).toHaveBeenCalledTimes(1)
    })

    it('未选岗位时先失败，不触碰字节（AC2.1）', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'upload_resume_files', {} as never,
        { buffer: docxFixture, originalname: '张三.docx' } as never
      )
      expect(res).toMatchObject({ success: false })
      expect(JSON.stringify(res.message)).toContain('请先选择岗位')
      expect(uploadService.fileStore.put).not.toHaveBeenCalled()
    })

    it('未知文件动作 key 被拒绝', async () => {
      const res = await uploadProvider.executeViewFileAction!(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'download_everything', fileRequest,
        { buffer: docxFixture, originalname: 'a.docx' } as never
      )
      expect(res).toMatchObject({ success: false })
    })
  })

  // v5 预览动作：按候选人行取原始文件 → 渲染 html/base64；内部 key 绝不进回执（spec §3.6）
  describe('executeViewAction (preview_candidate)', () => {
    const docxFixture = readFileSync(join(__dirname, '__fixtures__', 'resume-minimal.docx'))
    const pdfFixture = readFileSync(join(__dirname, '__fixtures__', 'resume-minimal.pdf'))
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    /**
     * 构造只带预览协作件的 provider
     *
     * @param buffer 读盘桩返回的字节（真实字节，让 html/base64 分支走到真实现）
     * @param file getResumeFileForPreview 返回的定位三要素；service 已 fail-closed，
     *             任何不可预览（不存在/无权/无文件/数据不一致）都收敛为 null，
     *             因此本层不再有「空 mime」这类中间分支
     */
    function previewProvider(buffer: Buffer, file: { filePath: string; mime: string; fileName: string } | null) {
      const svc = {
        getViewData: jest.fn(async () => viewData),
        getResumeFileForPreview: jest.fn(async () => file),
        fileStore: { read: jest.fn(async () => buffer) }
      }
      return { svc, provider: new ResumeScreenViewProvider(svc as never, noopIntakeQueue as never) }
    }

    it('docx → kind html，回执不含内部文件路径', async () => {
      const { provider } = previewProvider(docxFixture, { filePath: '2026-09-29/153b80d355c9fe86.docx', mime: DOCX_MIME, fileName: '张三.docx' })
      const res = await provider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'preview_candidate',
        { input: { candidateId: 'c1' }, targetId: 'c1' } as never
      )
      expect(res.success).toBe(true)
      expect(res.refresh).toBe(false)
      expect((res.data as { kind: string }).kind).toBe('html')
      expect(JSON.stringify(res.data)).not.toContain('2026-09-29/153b80d355c9fe86.docx')
      expect((res.data as { fileName: string }).fileName).toBe('张三.docx')
    })

    it('pdf → kind pdf + base64', async () => {
      const { provider } = previewProvider(pdfFixture, { filePath: '2026-09-29/951b13649f7bc2db.pdf', mime: 'application/pdf', fileName: '李四.pdf' })
      const res = await provider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'preview_candidate',
        { input: { candidateId: 'c1' }, targetId: 'c1' } as never
      )
      expect((res.data as { kind: string; base64?: string }).kind).toBe('pdf')
      expect(Buffer.from((res.data as { base64: string }).base64, 'base64').equals(pdfFixture)).toBe(true)
      expect(JSON.stringify(res.data)).not.toContain('951b13649f7bc2db')
    })

    it('行上没有溯源文件名时用中性文案，不回显候选人主键', async () => {
      // sourceFileName 为空的历史行：fileName 兜底必须是给人看的文案，而不是 UUID 或存储 key
      const { provider } = previewProvider(pdfFixture, { filePath: '2026-09-29/951b13649f7bc2db.pdf', mime: 'application/pdf', fileName: '' })
      const res = await provider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'preview_candidate',
        { input: { candidateId: 'c1' }, targetId: 'c1' } as never
      )
      expect(res.success).toBe(true)
      expect((res.data as { fileName: string }).fileName).toBe('未命名简历')
      // 内部定位 key 不作为展示字段下发（红线：filePath 不进浏览器）
      expect(Object.keys(res.data as Record<string, unknown>)).toEqual(['kind', 'base64', 'fileName', 'mime'])
    })

    it('存量行没有文件：可读失败，不落 500（spec §6.4）', async () => {
      const { svc, provider } = previewProvider(pdfFixture, null)
      const res = await provider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'preview_candidate',
        { input: { candidateId: 'c1' }, targetId: 'c1' } as never
      )
      expect(res.success).toBe(false)
      expect(JSON.stringify(res.message)).toContain('重新上传')
      expect(svc.fileStore.read).not.toHaveBeenCalled()
    })

    it('缺少 candidateId 参数直接失败', async () => {
      const { svc, provider } = previewProvider(pdfFixture, null)
      const res = await provider.executeViewAction(
        createContext(), RESUME_SCREEN_WORKBENCH_VIEW_KEY, 'preview_candidate', { input: {} } as never
      )
      expect(res.success).toBe(false)
      expect(svc.getResumeFileForPreview).not.toHaveBeenCalled()
    })
  })
})
