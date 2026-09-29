/**
 * 简历筛选工作台视图提供者
 *
 * 以 @ViewExtensionProvider 声明为 resume_screen 提供者：向 agent 工作台
 * main/fixed 双槽位发布简历初筛工作台的远端组件 manifest，代理视图数据查询
 * 并把宿主上下文（租户/组织/助手/会话）收敛为服务层 scope，保证视图读写与
 * 中间件工具同源隔离。
 */
import { Injectable, Logger } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewDataSource,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, ViewExtensionProvider, renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
import type { XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  RESUME_SCREEN_FEATURE,
  RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES,
  RESUME_SCREEN_PLUGIN_NAME,
  RESUME_SCREEN_PROVIDER_KEY,
  RESUME_SCREEN_REMOTE_ENTRY_KEY,
  RESUME_SCREEN_WORKBENCH_VIEW_KEY
} from './constants'
import { ResumeScreenIntakeQueue } from './resume-screen-intake-queue'
import { RESUME_FILE_MAX_BYTES, detectResumeFileKind } from './resume-file-parser'
import type { ResumeFileKind } from './resume-file-parser'
import { ResumeFileStore } from './resume-file-store'
import type { StoredResumeFile } from './resume-file-store'
import { renderResumePreview } from './resume-preview'
import { RESUME_SCREEN_REVISION_CONFLICT_CODE, ResumeScreenRevisionConflictError, ResumeScreenService } from './resume-screen.service'
import type {
  ResumeScreenCandidateListQuery,
  ResumeScreenCandidateStatus,
  ResumeScreenIntakeDraftResult,
  ResumeScreenIntakeFile,
  ResumeScreenScope
} from './types'

// 以本文件位置为基准解析 react/react-dom 的 UMD 产物，供远端组件 iframe 渲染壳使用
const requireFromHere = createRequire(__filename)

// 新建岗位 JD 最短字数闸：与服务层 createJob 同口径，视图入口先拦一次避免异常兜底转译
const MIN_JD_LENGTH = 30

// 双语文案便捷构造：manifest 文案字段统一为 I18nObject
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

// 本插件仅发布工作台一个视图，viewKey 白名单据此收敛
function isResumeScreenViewKey(viewKey: string) {
  return viewKey === RESUME_SCREEN_WORKBENCH_VIEW_KEY
}

/**
 * 宿主上下文 → 服务层多租户 scope
 *
 * 平台真实上下文中助手 id 挂载在 hostId、会话 id 挂载在 runtimeScope.conversationId；
 * xpertId/conversationId 直传字段用于测试桩与未来宿主升级的兼容入口，两者取先命中者。
 */
function scopeFromContext(context: XpertResolvedViewHostContext): ResumeScreenScope {
  const hints = context as { xpertId?: string; conversationId?: string }
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    userId: context.userId ?? null,
    assistantId: hints.xpertId ?? context.hostId ?? null,
    conversationId: hints.conversationId ?? context.runtimeScope?.conversationId ?? null
  }
}

// 查询参数取单值字符串：数组参数取首个命中值，空串视为未提供
function getStringParameter(parameters: Record<string, unknown> | null | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

// 远端组件视图 schema：react 运行时 + iframe 隔离 + 平台数据源（结构对齐平台契约）
function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: {
      isolation: 'iframe' as const,
      entry: RESUME_SCREEN_REMOTE_ENTRY_KEY
    },
    dataSource: {
      mode: 'platform' as const
    }
  }
}

// 平台数据源声明：分页/搜索/排序/过滤/参数全开，默认页大小与服务 getViewData 兜底一致
function platformDataSource(): XpertViewDataSource {
  return {
    mode: 'platform' as const,
    querySchema: {
      supportsPagination: true,
      supportsSearch: true,
      supportsSort: true,
      supportsFilter: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: {
      enabled: false
    }
  }
}

// 宿主事件订阅：AI 回填工具完成后前推进货刷新，让工作台自动看到新解析结果
function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'resume-screen-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

@Injectable()
@ViewExtensionProvider(RESUME_SCREEN_PROVIDER_KEY)
export class ResumeScreenViewProvider implements IXpertViewExtensionProvider {
  // 上传/预览属用户入口，失败原因必须落服务端日志（只记业务标识，绝不记简历字节）
  private readonly logger = new Logger(ResumeScreenViewProvider.name)

  constructor(
    private readonly service: ResumeScreenService,
    private readonly intakeQueue: ResumeScreenIntakeQueue
  ) {}

  // 仅在 agent 工作台宿主生效，其他宿主（如集成页）不发布本视图
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  /**
   * 发布视图 manifest：agent 工作台 main/fixed 双槽均返回工作台视图
   *
   * 槽位分工（spec v2.4/蓝图 v4.3）：main 槽唯一消费者是 studio 工作流中间件
   * 面板；运行时用户对话只查询 fixed 槽并据此开远程组件 tab——只注册 main 会让
   * 工作台在真机对话中不出现。fixed 变体额外挂 workbench:{fixed,menu} 供宿主
   * 渲染置顶菜单入口；两槽宿主 policy 均为 requireFeatureActivation，
   * activation 必须原样保留。manifest 其余字段两变体逐字段一致。
   *
   * @param context 宿主解析后的上下文（本方法不读取，保持签名对齐接口）
   * @param slot 宿主槽位标识，仅 agent.workbench.main / agent.workbench.fixed 命中
   * @returns manifest 数组；非目标槽位返回空数组
   */
  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const isFixedSlot = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: RESUME_SCREEN_WORKBENCH_VIEW_KEY,
        title: text('Resume Screening Workbench', '简历初筛工作台'),
        description: text(
          'Switch jobs, review AI-scored candidates and paste resumes for batch screening.',
          '切换岗位、审核 AI 评分候选人，并批量粘贴简历进行初筛。'
        ),
        icon: {
          type: 'font',
          value: 'ri-file-user-line',
          color: '#1d4ed8'
        },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: true,
        // 特性开关：插件能力未启用时不展示工作台入口
        activation: {
          requiredFeatures: [RESUME_SCREEN_FEATURE]
        },
        // fixed 变体附加工作台注册描述符（照抄 smart-maintenance 写法）：运行时对话据此渲染置顶菜单并开 tab；
        // main 变体保持现状不加 workbench 字段，studio 行为不受影响
        ...(isFixedSlot
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Resume Screening', '简历初筛'),
                  order: 20,
                  icon: {
                    type: 'font',
                    value: 'ri-file-user-line',
                    color: '#1d4ed8'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: RESUME_SCREEN_PROVIDER_KEY,
          plugin: RESUME_SCREEN_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        // 客户端命令：视图可把文本发送到当前助手对话（批量录入/重试都走该通道）
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'upload_resume_files',
            label: text('Upload Resumes', '上传简历文件'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            // 文件通道必须在此声明：平台按 manifest 的 transport 路由 multipart 上传动作
            transport: 'file'
          },
          { key: 'create_job', label: text('Create Job', '新建岗位'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'retry_candidate', label: text('Retry', '重试'), icon: 'ri-restart-line', placement: 'toolbar', actionType: 'invoke' },
          {
            key: 'preview_candidate',
            label: text('Preview resume', '预览简历'),
            icon: 'ri-file-search-line',
            placement: 'toolbar',
            // 刻意不声明 transport：契约里该字段只有 'json'|'file'，缺省即普通 invoke 回执通道
            // （html/base64 经 action 回执下发，不走 multipart 文件通道）
            actionType: 'invoke'
          },
          { key: 'update_candidate', label: text('Save', '保存'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          {
            key: 'accept_candidate',
            label: text('Advance', '推进'),
            icon: 'ri-arrow-right-up-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          { key: 'hold_candidate', label: text('Hold', '待定'), icon: 'ri-pause-line', placement: 'toolbar', actionType: 'invoke' },
          {
            key: 'reject_candidate',
            label: text('Reject', '淘汰'),
            icon: 'ri-close-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'reset_candidate',
            label: text('Reset to Pending', '撤回为待审'),
            icon: 'ri-arrow-go-back-line',
            placement: 'toolbar',
            actionType: 'invoke'
          }
        ]
      }
    ]
  }

  /**
   * 返回远端组件 iframe 入口 HTML
   *
   * 读取构建产物中的 app.js，并以内联 react/react-dom UMD 的渲染壳包装；
   * 非本插件的组件/视图请求返回占位页，避免泄露或误渲染。
   *
   * @param context 宿主上下文（渲染不依赖上下文，保持签名对齐接口）
   * @param viewKey 视图标识
   * @param component 宿主解析出的组件描述，entry 必须与本插件声明一致
   * @returns iframe HTML 与内容类型
   */
  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (component.entry !== RESUME_SCREEN_REMOTE_ENTRY_KEY || !isResumeScreenViewKey(viewKey)) {
      return {
        html: '<!doctype html><html><body>Unsupported resume-screen component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    // app.js 由远端组件构建链产出（copy-assets 负责拷入 dist），缺失时快速失败暴露构建问题
    const appPath = join(__dirname, 'remote-components', RESUME_SCREEN_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    // app.css = shadcn 基础样式 + remixicon 图标子集：iframe 壳是内联 style，
    // 不注入则组件无样式、`<i class="ri-*">` 无字形（蓝图 §10 P1 交付通道，写法对齐 crm）
    const appCss = await readFile(join(__dirname, 'remote-components', RESUME_SCREEN_REMOTE_ENTRY_KEY, 'app.css'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Resume Screening Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  /**
   * 视图数据查询：把宿主查询参数翻译为服务层列表条件后委托 getViewData
   *
   * 非本插件的 viewKey 返回空对象；jobId/状态/排序走 parameters，关键字与分页
   * 走宿主标准查询字段，映射口径与 manifest 的 querySchema 声明一致。
   *
   * @param context 宿主上下文，收敛为服务层 scope 实现租户隔离
   * @param viewKey 视图标识
   * @param query 宿主标准查询（分页/关键字/参数）
   * @returns 视图聚合数据（jobs/job/candidates/stats/page）
   */
  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (!isResumeScreenViewKey(viewKey)) {
      return {}
    }
    const listQuery: ResumeScreenCandidateListQuery = {
      jobId: getStringParameter(query.parameters, 'jobId'),
      status: getStringParameter(query.parameters, 'status') as ResumeScreenCandidateStatus | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: getStringParameter(query.parameters, 'sortBy') as ResumeScreenCandidateListQuery['sortBy'],
      sortDir: getStringParameter(query.parameters, 'sortDir') as ResumeScreenCandidateListQuery['sortDir']
    }
    return (await this.service.getViewData(scopeFromContext(context), listQuery)) as never
  }

  /**
   * 视图动作执行：刷新/新建岗位/重试入队/预览原始简历/人工保存/处置动作的统一入口
   *
   * 解析驱动已切到链路 B：重试直接经 intakeQueue 入队由 worker 模型直调，
   * 不再走对话指令旁路（录入统一走 upload_resume_files 文件通道）；v5 的预览动作
   * 只读服务端已落盘的原始字节并渲染成 html/base64，内部存储 key 不进回执。服务层
   * 异常统一转为可读 I18n 失败结果，不向外泄露堆栈。
   *
   * @param context 宿主上下文（scope.userId 作为处置操作人兜底）
   * @param viewKey 视图标识，非本插件的视图直接返回失败
   * @param actionKey manifest actions 中声明的动作键
   * @param request 动作载荷（input/targetId），candidateId 优先取 input 再回退 targetId
   * @returns 动作结果：成功时携带刷新标记与业务数据，失败时携带可读文案
   */
  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (!isResumeScreenViewKey(viewKey)) {
        return failure('Unsupported action', '不支持的操作')
      }
      const scope = scopeFromContext(context)
      // candidateId 允许走 targetId（行内按钮场景）或 input（表单场景）
      const candidateId = getStringInput(request.input, 'candidateId') ?? request.targetId ?? undefined

      if (actionKey === 'refresh') {
        return success('Refreshed', '已刷新')
      }

      if (actionKey === 'create_job') {
        // 新建岗位：表单输入取标题与 JD 原文，校验口径与服务层 createJob 对齐
        const input = request.input as Record<string, unknown> | undefined
        const title = String(input?.title ?? '').trim()
        const jdText = String(input?.jdText ?? '').trim()
        if (!title || jdText.length < MIN_JD_LENGTH) {
          return failure('Invalid job input', `岗位名称必填且 JD 不少于 ${MIN_JD_LENGTH} 字`)
        }
        // 幂等由 service.jdHash 兜底：重复提交同文 JD 返回既有岗位，视图层照常 success
        const job = await this.service.createJob(scope, { title, jdText })
        return { ...success('Job created', '岗位已创建'), data: { job } }
      }

      if (actionKey === 'retry_candidate') {
        if (!candidateId) {
          return failure('Candidate is required', '缺少候选人')
        }
        // retryCandidate 条件重置为 parsing 并清失败原因，attemptCount 保留历史值
        const view = await this.service.retryCandidate(scope, candidateId)
        // 入队走链路 B 由 worker 直接重跑（不再发对话指令）。jobSuffix=r{revision} 保证
        // 人工重试的 jobId 与首投 resume-parse-{id}-{n} 变号：首投失败后 attemptCount 可能
        // 未自增（markCandidateFailed 路径才有 +1），靠 revision 后缀区分代际绕开 BullMQ 去重（F5）。
        await this.intakeQueue.enqueueParse({
          candidateId,
          attemptCount: view.attemptCount ?? 0,
          jobSuffix: `r${view.revision ?? 1}`,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          userId: scope.userId ?? undefined
        })
        return { ...success('Retry enqueued', '已重新排队解析'), data: { id: candidateId, status: view.status } }
      }

      if (actionKey === 'preview_candidate') {
        if (!candidateId) {
          return failure('Candidate is required', '缺少候选人')
        }
        // service 侧 fail-closed：要么给完整三要素，要么 null（行不存在/越权/无文件/
        // 有 key 无 mime 的数据不一致四种原因在调用方不可区分），所以这里没有「空 mime」分支
        const file = await this.service.getResumeFileForPreview(scope, candidateId)
        if (!file) {
          // 与 §6.4 界面文案同源：旧数据没有字节，只能重新上传
          return failure('Resume file unavailable', '该候选人未保留原始简历文件，无法预览，请重新上传该简历')
        }
        const buffer = await this.service.fileStore.read(file.filePath)
        const payload = await renderResumePreview(buffer, file.mime)
        // filePath 只用于服务端读盘，回执里绝不外泄（spec §3.6）；
        // 文件名缺省走中性文案，不把内部主键 UUID 当简历名回显给用户
        return {
          success: true,
          refresh: false,
          data: { ...payload, fileName: file.fileName || '未命名简历', mime: file.mime }
        }
      }

      if (actionKey === 'update_candidate') {
        if (!candidateId) {
          return failure('Candidate is required', '缺少候选人')
        }
        const patch = (request.input as { patch?: Record<string, unknown> })?.patch ?? {}
        // 版本号必须是 ≥1 的整数：非法即直接失败回执，不再默认成 1 代打——默认值会把
        // 调用方丢版本号的缺陷伪装成一次正常保存，并可能覆盖他人的新版本（S7 审核 F1）
        const expectedRevision = Number((request.input as { expectedRevision?: unknown })?.expectedRevision)
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
          return failure('Invalid expectedRevision', '保存版本号无效，请重新打开详情后重试')
        }
        const updated = await this.service.updateCandidate(scope, candidateId, patch as never, expectedRevision)
        // 回传最新版本号，前端据此更新下一次提交的乐观锁期望值
        return {
          ...success('Saved', '已保存（人工修正字段不会被 AI 覆盖）'),
          data: { id: updated.id, revision: updated.revision }
        }
      }

      // 处置动作映射：accept/hold/reject/reset 一组同构分支合并处理
      const reviewActionMap: Record<string, 'accept' | 'hold' | 'reject' | 'reset_to_pending'> = {
        accept_candidate: 'accept',
        hold_candidate: 'hold',
        reject_candidate: 'reject',
        reset_candidate: 'reset_to_pending'
      }
      const reviewAction = reviewActionMap[actionKey]
      if (reviewAction) {
        if (!candidateId) {
          return failure('Candidate is required', '缺少候选人')
        }
        // 操作人取宿主上下文用户，缺省时以 unknown 兜底保证审计字段不空置
        const reviewed = await this.service.reviewCandidate(scope, candidateId, reviewAction, scope.userId ?? 'unknown')
        return { ...success('Reviewed', '处置成功'), data: { id: reviewed.id, status: reviewed.status } }
      }

      return failure(`Unknown action: ${actionKey}`, `未知操作：${actionKey}`)
    } catch (error) {
      // 乐观锁冲突：失败回执额外携带机读 code='revision_conflict'，前端优先消费结构化
      // 标记而不是中文文案正则（S7 审核 F5）；回执其余结构（success:false + 双语文案）不变
      if (error instanceof ResumeScreenRevisionConflictError) {
        const message = getActionErrorMessage(error, '操作失败')
        return {
          ...failure(message, message),
          data: { code: RESUME_SCREEN_REVISION_CONFLICT_CODE }
        }
      }
      // 其余服务层异常转可读提示；message 为业务文案，不含堆栈
      const message = getActionErrorMessage(error, '操作失败')
      return failure(message, message)
    }
  }

  /**
   * 文件动作：上传简历（spec v5 §3.4/§3.5）
   *
   * 请求内只做「大小闸 → 字节校验 → 落盘 → 建 draft 行 → 置 parsing → 入队」，
   * 文本解析推迟到队列任务期执行：上传回执延迟从秒级降到百毫秒级，解析崩溃不再丢文件。
   * 入队失败必须把行收敛为 failed，否则工作台留下不可重试的黑洞行。
   * jobId 取宿主 query-parameters 视图态通道（P5，与 getViewData 的 jobId 同源）。
   *
   * @param context 宿主上下文，收敛为服务层 scope
   * @param viewKey manifest 裸键（平台已剥离 provider 前缀），仅本插件工作台命中
   * @param actionKey manifest actions 中 transport=file 的动作键
   * @param request 动作请求（parameters 携带当前选中 jobId）
   * @param file 宿主透传的文件（buffer/originalname/mimetype/size）
   * @returns 成功：refresh + created/skipped + 文件名；失败：可读指引文案（不含内部存储 key）
   */
  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (!isResumeScreenViewKey(viewKey) || actionKey !== 'upload_resume_files') {
      return failure('Unsupported file action', '不支持的文件操作')
    }
    const scope = scopeFromContext(context)
    // 岗位是候选人行的归属前提：未选岗位时必须在看不到任何字节之前就失败
    const jobId = getStringParameter(request.parameters, 'jobId')
    if (!jobId) {
      return failure('Missing jobId', '请先选择岗位后再上传简历')
    }
    const buffer = file.buffer as Buffer
    const fileName = file.originalname || ''
    if (!buffer?.length) {
      return failure('Empty file', '文件内容为空')
    }
    // 尺寸闸前置在任何写盘之前：不把 10MB+ 字节落进磁盘再失败
    if (buffer.length > RESUME_FILE_MAX_BYTES) {
      return failure('File too large', `单个简历文件不能超过 ${Math.floor(RESUME_FILE_MAX_BYTES / (1024 * 1024))}MB，请压缩或拆分后重新上传`)
    }
    // 类型闸（扩展名 + 魔数双重判定，复用 T3 纯函数 detectResumeFileKind）先于落盘：
    // 既不让伪装后缀写成无人引用的孤儿文件，也给下面描述符的 mime 提供唯一来源
    let kind: ResumeFileKind
    try {
      kind = detectResumeFileKind(buffer, fileName)
    } catch (error) {
      // detectResumeFileKind 只抛 unsupported_format，其文案本身即可读指引
      const message = getActionErrorMessage(error, '文件格式不支持')
      this.logger.warn(`简历文件类型校验失败：job=${jobId} file=${fileName} 原因=${message}`)
      return failure(message, message)
    }
    let stored: StoredResumeFile
    try {
      // 只复用 service 上的唯一 ResumeFileStore 实例（全插件单例，§3.1）：本类绝不 new 第二个
      // store——两个实例意味着两套根目录解析，落盘与读盘可能指向不同物理路径。
      // key 由内容决定、永不拼接用户文件名（越界防护与幂等去重都挂在这条不变量上）
      stored = await this.service.fileStore.put({ buffer, fileName })
    } catch (error) {
      const message = getActionErrorMessage(error, '文件写入失败')
      // 日志刻意不带任何字节信息，只留可定位的业务标识
      this.logger.warn(`简历文件落盘失败：job=${jobId} file=${fileName} 原因=${message}`)
      return failure(message, message)
    }
    // mime 取本层 kind 而不是 store 回执：预览分支（html/pdf）完全由 mime 决定，
    // 必须与上面判定的类型同源；store 只负责贡献 key/size/sha256 三个落盘事实
    const descriptor: ResumeScreenIntakeFile = {
      key: stored.key,
      size: stored.size,
      sha256: stored.sha256,
      mime: ResumeFileStore.kindToMime(kind),
      sourceFileName: fileName
    }
    let result: ResumeScreenIntakeDraftResult
    try {
      result = await this.service.prepareIntakeDraft(scope, jobId, [descriptor])
    } catch (error) {
      // 建行失败（岗位不存在/超批量上限）：字节已落盘但无行引用它，属可重传的孤儿字节，
      // 由目录按日期清理策略兜底（§3.1）；此处只回报失败，不静默吞掉原因
      const message = getActionErrorMessage(error, '候选人记录创建失败')
      this.logger.warn(`简历草稿行创建失败：job=${jobId} file=${fileName} 原因=${message}`)
      return failure(message, message)
    }
    for (const candidate of result.created) {
      try {
        // 两段式状态推进：draft → parsing 由 service 条件写库（只对 draft 生效）
        await this.service.markCandidateParsing(scope, candidate.id)
        await this.intakeQueue.enqueueParse({
          candidateId: candidate.id,
          attemptCount: candidate.attemptCount ?? 0,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          userId: scope.userId ?? undefined
        })
      } catch (error) {
        // 入队失败：行留在 draft 不会被 sweep 捞（sweep 只扫 parsing），必须就地标 failed 给用户重试入口
        const message = getActionErrorMessage(error, '解析任务入队失败')
        await this.service.markCandidateFailed(scope, candidate.id, `解析任务入队失败：${message.slice(0, 500)}`)
        this.logger.warn(`解析任务入队失败并已收敛为 failed：job=${jobId} candidate=${candidate.id} 原因=${message}`)
        return failure(message, message)
      }
    }
    return {
      success: true,
      refresh: true,
      data: {
        fileName,
        created: result.created.map((c) => ({ id: c.id, status: c.status })),
        skipped: result.skippedAsExisting.length,
        sourceFileName: fileName
      }
    }
  }
}

// 从本包依赖中读取 react/react-dom 的 UMD 文件内容，避免硬编码 node_modules 路径
async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

// 动作输入取单值字符串：空串/纯空白视为未提供
function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// 动作成功结果：默认要求宿主刷新视图以反映最新数据
function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

// 动作失败结果：仅携带可读文案，不携带刷新标记
function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

// 异常消息归一：优先透出业务异常文案（如乐观锁冲突提示），无文案时回退通用提示
function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallback
}
