/**
 * 简历筛选工作台视图提供者
 *
 * 以 @ViewExtensionProvider 声明为 resume_screen 提供者：向 agent 工作台主槽位
 * 发布简历初筛工作台的远端组件 manifest，代理视图数据查询并把宿主上下文
 * （租户/组织/助手/会话）收敛为服务层 scope，保证视图读写与中间件工具同源隔离。
 */
import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewDataResult,
  XpertViewDataSource,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, ViewExtensionProvider, renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_MAIN_SLOT,
  RESUME_SCREEN_FEATURE,
  RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES,
  RESUME_SCREEN_PLUGIN_NAME,
  RESUME_SCREEN_PROVIDER_KEY,
  RESUME_SCREEN_REMOTE_ENTRY_KEY,
  RESUME_SCREEN_WORKBENCH_VIEW_KEY
} from './constants'
import { ResumeScreenService } from './resume-screen.service'
import type {
  ResumeScreenCandidateListQuery,
  ResumeScreenCandidateStatus,
  ResumeScreenScope
} from './types'

// 以本文件位置为基准解析 react/react-dom 的 UMD 产物，供远端组件 iframe 渲染壳使用
const requireFromHere = createRequire(__filename)

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
  constructor(private readonly service: ResumeScreenService) {}

  // 仅在 agent 工作台宿主生效，其他宿主（如集成页）不发布本视图
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  /**
   * 发布视图 manifest：仅 agent 工作台主槽位返回工作台视图
   *
   * manifest 声明远端组件入口、平台数据源、AI 工具完成事件订阅与工作台全部
   * 操作按钮；宿主据此渲染入口并路由数据/动作调用。
   *
   * @param context 宿主解析后的上下文（本方法不读取，保持签名对齐接口）
   * @param slot 宿主槽位标识，仅 agent.workbench.main 命中
   * @returns manifest 数组；非目标槽位返回空数组
   */
  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT) {
      return []
    }
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
            key: 'prepare_parse_message',
            label: text('Submit Resumes to AI', '提交并交给 AI 解析'),
            icon: 'ri-send-plane-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          { key: 'retry_candidate', label: text('Retry', '重试'), icon: 'ri-restart-line', placement: 'toolbar', actionType: 'invoke' },
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
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Resume Screening Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript
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
}

// 从本包依赖中读取 react/react-dom 的 UMD 文件内容，避免硬编码 node_modules 路径
async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}
