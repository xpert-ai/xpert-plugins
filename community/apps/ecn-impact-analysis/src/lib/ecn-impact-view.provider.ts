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
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataSource,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  ECN_IMPACT_FEATURE,
  ECN_IMPACT_MIDDLEWARE_TOOL_NAMES,
  ECN_IMPACT_PLUGIN_NAME,
  ECN_IMPACT_PROVIDER_KEY,
  ECN_IMPACT_REMOTE_ENTRY_KEY,
  ECN_IMPACT_WORKBENCH_VIEW_KEY
} from './constants'
import { EcnImpactService } from './ecn-impact.service'
import type { EcnChangeType, EcnScope } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(ECN_IMPACT_PROVIDER_KEY)
export class EcnImpactViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: EcnImpactService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    const base = fixed
      ? {
          activation: {
            requiredFeatures: [ECN_IMPACT_FEATURE]
          },
          workbench: {
            fixed: true
          }
        }
      : {}

    return [
      {
        key: ECN_IMPACT_WORKBENCH_VIEW_KEY,
        title: text('ECN Impact Review Desk', '变更影响评估台'),
        description: text(
          'Create engineering change assessments, review AI impact findings with evidence, and confirm the evaluation.',
          '创建工程变更评估单，审核带证据的 AI 影响项，确认影响评估。'
        ),
        icon: {
          type: 'font',
          value: 'ri-git-branch-line',
          color: '#1d4ed8'
        },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: true,
        ...base,
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('ECN Impact', '变更影响'),
                  order: 20,
                  icon: {
                    type: 'font',
                    value: 'ri-git-branch-line',
                    color: '#1d4ed8'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: ECN_IMPACT_PROVIDER_KEY,
          plugin: ECN_IMPACT_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'create_assessment',
            label: text('New Assessment', '新建评估'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'send_to_chat',
            label: text('Send to Assistant', '发送到对话'),
            icon: 'ri-send-plane-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'retry_analysis',
            label: text('Retry Analysis', '重新分析'),
            icon: 'ri-restart-line',
            actionType: 'invoke'
          },
          {
            key: 'review_item',
            label: text('Review Item', '审核影响项'),
            icon: 'ri-checkbox-circle-line',
            actionType: 'invoke'
          },
          {
            key: 'confirm_assessment',
            label: text('Confirm Assessment', '确认评估'),
            icon: 'ri-check-double-line',
            actionType: 'invoke'
          },
          {
            key: 'close_assessment',
            label: text('Archive', '归档'),
            icon: 'ri-archive-line',
            actionType: 'invoke'
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
    if (component.entry !== ECN_IMPACT_REMOTE_ENTRY_KEY || viewKey !== ECN_IMPACT_WORKBENCH_VIEW_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported ECN impact component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', ECN_IMPACT_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const appCss = await readFile(
      join(__dirname, 'remote-components', ECN_IMPACT_REMOTE_ENTRY_KEY, 'app.css'),
      'utf8'
    ).catch(() => '')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'ECN Impact Review Desk',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== ECN_IMPACT_WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: getStringParameter(query.parameters, 'status'),
      selectionId: getStringParameter(query.parameters, 'selectionId')
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== ECN_IMPACT_WORKBENCH_VIEW_KEY) {
        return failure('Unsupported action', '不支持的操作')
      }
      const scope = scopeFromContext(context)
      const operatorName = operatorFromContext(context)

      if (actionKey === 'refresh') {
        return success('View refreshed', '视图已刷新')
      }

      if (actionKey === 'create_assessment') {
        const materialNo = getStringInput(request.input, 'materialNo')
        const changeDescription = getStringInput(request.input, 'changeDescription')
        const changeType = getStringInput(request.input, 'changeType') as EcnChangeType | undefined
        if (!materialNo || !changeDescription) {
          return failure('Material number and change description are required', '物料号和变更内容为必填项')
        }
        const { assessment, created } = await this.service.createAssessment(scope, {
          changeNo: getStringInput(request.input, 'changeNo'),
          materialNo,
          materialName: getStringInput(request.input, 'materialName'),
          changeType: changeType ?? 'other',
          changeDescription,
          changeReason: getStringInput(request.input, 'changeReason')
        })
        return {
          success: true,
          message: created
            ? text(
                `Assessment ${assessment.changeNo} created as draft. Send it to the Assistant to start the AI analysis.`,
                `评估单 ${assessment.changeNo} 已创建（草稿）。发送到助手即可开始 AI 影响分析。`
              )
            : text(
                `Assessment ${assessment.changeNo} already exists; continue with it.`,
                `变更 ${assessment.changeNo} 已存在评估单，请直接使用。`
              ),
          refresh: true,
          data: {
            assessmentId: assessment.id,
            changeNo: assessment.changeNo,
            created,
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildAnalysisMessage(assessment.changeNo!, assessment.materialNo!, assessment.changeDescription ?? '')
            }
          }
        }
      }

      const assessmentId = request.targetId ?? getStringInput(request.input, 'assessmentId')
      if (!assessmentId) {
        return failure('Assessment is required', '缺少评估单')
      }

      if (actionKey === 'send_to_chat') {
        const detail = await this.service.getAssessmentDetail(scope, assessmentId)
        return {
          success: true,
          message: text('Analysis request prepared', '分析请求已准备'),
          refresh: false,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildAnalysisMessage(detail.changeNo, detail.materialNo, detail.changeDescription)
            }
          }
        }
      }
      if (actionKey === 'retry_analysis') {
        const detail = await this.service.recordRetry(scope, assessmentId, operatorName)
        return {
          success: true,
          message: text(
            `Retry #${detail.retryCount} requested; the Assistant will re-run the analysis.`,
            `已发起第 ${detail.retryCount} 次分析请求，助手将重新执行影响分析。`
          ),
          refresh: true,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildRetryMessage(detail.changeNo, detail.id)
            }
          }
        }
      }
      if (actionKey === 'review_item') {
        const itemId = getStringInput(request.input, 'itemId')
        const decision = getStringInput(request.input, 'decision')
        if (!itemId || (decision !== 'accepted' && decision !== 'rejected')) {
          return failure('itemId and decision (accepted/rejected) are required', '缺少影响项或审核结论')
        }
        await this.service.reviewItem(
          scope,
          assessmentId,
          itemId,
          decision,
          getStringInput(request.input, 'note'),
          operatorName
        )
        return success(
          decision === 'accepted' ? 'Impact item accepted' : 'Impact item rejected',
          decision === 'accepted' ? '影响项已采纳' : '影响项已驳回'
        )
      }
      if (actionKey === 'confirm_assessment') {
        await this.service.confirmAssessment(scope, assessmentId, operatorName)
        return success('Assessment confirmed', '评估已确认完成')
      }
      if (actionKey === 'close_assessment') {
        await this.service.closeAssessment(scope, assessmentId, getStringInput(request.input, 'reason'), operatorName)
        return success('Assessment archived', '评估单已归档')
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: {
      isolation: 'iframe' as const,
      entry: ECN_IMPACT_REMOTE_ENTRY_KEY
    },
    dataSource: {
      mode: 'platform' as const
    }
  }
}

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

function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'ecn-impact-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...ECN_IMPACT_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): EcnScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function operatorFromContext(context: XpertResolvedViewHostContext): string | undefined {
  return (
    (context as XpertResolvedViewHostContext & { userName?: string }).userName ??
    (context as XpertResolvedViewHostContext & { userId?: string }).userId
  )
}

function buildAnalysisMessage(changeNo: string, materialNo: string, changeDescription: string) {
  return [
    `请为工程变更 ${changeNo} 创建影响评估并执行 AI 影响分析。`,
    '标准流程：先调用 ecn_impact_create_assessment 创建评估单（变更对象物料号 ' +
      materialNo +
      '）；再调用 ecn_impact_get_material 核对物料；然后 ecn_impact_search_bom_parents 查父件链；用父件链中的物料号依次查询工艺路线、在制工单和库存；最后调用 ecn_impact_save_analysis 一次性保存影响项（每条带证据与建议措施）和整体风险等级。',
    '如果证据不足以得出有意义的影响项，请调用 ecn_impact_report_analysis_failure 说明原因，不要编造影响项。',
    '',
    `变更内容：${changeDescription}`
  ].join('\n')
}

function buildRetryMessage(changeNo: string, assessmentId: string) {
  return [
    `请对评估单 ${changeNo} 重新执行影响分析。`,
    `先调用 ecn_impact_get_assessment（assessmentId: ${assessmentId}）确认当前状态，然后按标准流程重新收集证据并调用 ecn_impact_save_analysis。`,
    '注意：已经由人工采纳或驳回的影响项不会被覆盖，请勿重复创建同一 impactKey 的影响项。'
  ].join('\n')
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallback
}
