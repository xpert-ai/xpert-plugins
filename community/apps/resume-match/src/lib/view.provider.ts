import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  APP_ICON,
  APP_ICON_DEFINITION,
  FEATURE,
  PLUGIN_NAME,
  PROVIDER_KEY,
  REMOTE_ENTRY,
  TOOL_NAMES,
  VIEW_KEY
} from './constants.js'
import { ResumeMatchService } from './analysis.service.js'
import { analysisInputSchema, confirmAnalysisSchema, retryAnalysisSchema } from './schemas.js'
import { viewScope } from './scope.js'

const requireHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class ResumeMatchViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ResumeMatchService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(
    _context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: VIEW_KEY,
        title: text('简历智能匹配工作台', '简历智能匹配工作台'),
        description: text(
          'Review explainable resume-to-job matches, confirm decisions, and recover saved results.',
          '查看可解释的简历与岗位匹配结论，完成人工确认并随时恢复已保存结果。'
        ),
        icon: APP_ICON_DEFINITION,
        hostType: 'agent',
        slot,
        order: 10,
        refreshable: true,
        activation: { requiredFeatures: [FEATURE] },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('简历智能匹配', '简历智能匹配'),
                  order: 10,
                  icon: APP_ICON_DEFINITION
                }
              }
            }
          : {}),
        source: {
          provider: PROVIDER_KEY,
          plugin: PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: { enabled: false }
        },
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send analysis task to Assistant', '发送分析任务给智能助理')
          }
        ],
        hostEvents: {
          subscriptions: [
            {
              key: 'resume-match-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...TOOL_NAMES]
              },
              action: { type: 'forward', debounceMs: 400 }
            }
          ]
        },
        actions: [
          {
            key: 'prepare_analysis',
            label: text('Start analysis', '开始智能分析'),
            icon: 'ri-sparkling-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'retry_analysis',
            label: text('Retry analysis', '重新分析'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'confirm_analysis',
            label: text('Confirm result', '确认结果'),
            icon: 'ri-check-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== VIEW_KEY || component.entry !== REMOTE_ENTRY) {
      return {
        contentType: 'text/html; charset=utf-8',
        html: '<!doctype html><html lang="zh-CN"><body>不支持的视图。</body></html>'
      }
    }
    const readPackageFile = (name: string, file: string) =>
      readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(__dirname, 'remote-components', REMOTE_ENTRY, 'app.js'), 'utf8'),
      readFile(join(__dirname, 'remote-components', REMOTE_ENTRY, 'app.css'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      contentType: 'text/html; charset=utf-8',
      html: renderRemoteReactIframeHtml({
        title: '简历智能匹配工作台',
        lang: 'zh-Hans',
        appScript,
        appCss,
        reactUmd,
        reactDomUmd
      })
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== VIEW_KEY) return {}
    return this.service.getViewData(viewScope(context), {
      page: query.page,
      pageSize: query.pageSize,
      selectionId: query.selectionId
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== VIEW_KEY) {
      return failure('不支持的视图', '不支持的视图')
    }
    try {
      const scope = viewScope(context)
      if (actionKey === 'refresh') {
        return {
          success: true,
          refresh: true,
          message: text('Refreshed', '已刷新')
        }
      }
      if (actionKey === 'prepare_analysis') {
        const input = analysisInputSchema.parse(request.input ?? {})
        const analysis = await this.service.create(scope, input)
        return {
          success: true,
          refresh: false,
          message: text('Analysis task created', '分析任务已创建，正在交给智能助理处理'),
          data: {
            analysisId: analysis.id,
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: this.service.buildAnalysisPrompt({
                analysisId: analysis.id,
                attempt: analysis.attempt,
                candidateName: analysis.candidateName,
                jobTitle: analysis.jobTitle
              })
            }
          }
        }
      }
      if (actionKey === 'retry_analysis') {
        const { analysisId, expectedRevision } = retryAnalysisSchema.parse(request.input ?? {})
        const analysis = await this.service.prepareRetry(scope, analysisId, expectedRevision)
        return {
          success: true,
          refresh: false,
          message: text('Retry task created', '已重新发起分析，请稍候'),
          data: {
            analysisId: analysis.id,
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: this.service.buildAnalysisPrompt({
                analysisId: analysis.id,
                attempt: analysis.attempt,
                candidateName: analysis.candidateName,
                jobTitle: analysis.jobTitle
              })
            }
          }
        }
      }
      if (actionKey === 'confirm_analysis') {
        const input = confirmAnalysisSchema.parse(request.input ?? {})
        const analysis = await this.service.confirm(scope, input)
        return {
          success: true,
          refresh: false,
          message: text('Human decision saved', '人工结论已保存'),
          data: { analysisId: analysis.id, revision: analysis.revision }
        }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      return failure('Action failed', getActionErrorMessage(error))
    }
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: {
      isolation: 'iframe',
      entry: REMOTE_ENTRY
    },
    dataSource: { mode: 'platform' }
  }
}

function failure(_en: string, zh: string): XpertViewActionResult {
  return {
    success: false,
    message: text(zh, zh)
  }
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试。'
}
