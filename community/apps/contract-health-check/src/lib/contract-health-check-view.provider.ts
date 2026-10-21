import { Injectable } from '@nestjs/common'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  CONTRACT_HEALTH_CHECK_FEATURE,
  CONTRACT_HEALTH_CHECK_PLUGIN_NAME,
  CONTRACT_HEALTH_CHECK_PROVIDER_KEY,
  CONTRACT_HEALTH_CHECK_VIEW_KEY,
  CONTRACT_ICON,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { ContractHealthCheckService } from './contract-health-check.service.js'
import type { ContractReviewJobType, ContractRiskDecision, ContractScope, ContractType } from './types.js'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const TOOL_NAMES = [
  'contract_save_extraction',
  'contract_save_risk_items',
  'contract_save_suggestions',
  'contract_save_summary',
  'contract_report_failure'
]

@Injectable()
@ViewExtensionProvider(CONTRACT_HEALTH_CHECK_PROVIDER_KEY)
export class ContractHealthCheckViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ContractHealthCheckService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }

    const isAgentFixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: CONTRACT_HEALTH_CHECK_VIEW_KEY,
        title: text('Contract Health Check', '合同智能体检'),
        description: text(
          'Create contract reviews, run AI risk review with rewrite suggestions, confirm findings, and save the report.',
          '新建合同体检，由 AI 完成风险审查与改写建议，逐条确认后保存报告。'
        ),
        icon: {
          type: 'font',
          value: 'ri-shield-check-line'
        },
        hostType: context.hostType,
        slot,
        order: 40,
        refreshable: true,
        activation: {
          requiredFeatures: [CONTRACT_HEALTH_CHECK_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Contract Health Check', '合同智能体检'),
                  order: 40,
                  icon: {
                    type: 'svg',
                    value: CONTRACT_ICON,
                    alt: 'Contract Health Check'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: CONTRACT_HEALTH_CHECK_PROVIDER_KEY,
          plugin: CONTRACT_HEALTH_CHECK_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: CONTRACT_HEALTH_CHECK_VIEW_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'contract-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: TOOL_NAMES
              },
              action: {
                type: 'refresh-and-forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'create_review',
            label: text('New Contract Review', '新建合同体检'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'start_review',
            label: text('Start Health Check', '开始体检'),
            icon: 'ri-flashlight-line',
            actionType: 'invoke'
          },
          {
            key: 'confirm_risk_decision',
            label: text('Confirm Risk Decision', '确认风险处理'),
            icon: 'ri-checkbox-circle-line',
            actionType: 'invoke'
          },
          {
            key: 'complete_review',
            label: text('Save Report', '保存报告'),
            icon: 'ri-save-line',
            actionType: 'invoke'
          },
          {
            key: 'retry_pipeline',
            label: text('Retry Failed Stage', '重试失败环节'),
            icon: 'ri-restart-line',
            actionType: 'invoke'
          },
          {
            key: 'delete_review',
            label: text('Delete Review', '删除体检记录'),
            icon: 'ri-delete-bin-line',
            actionType: 'invoke'
          }
        ]
      }
    ]
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== CONTRACT_HEALTH_CHECK_VIEW_KEY) {
      return {}
    }

    return this.service.getWorkbenchData(scopeFromContext(context), {
      reviewId: getStringParameter(query.parameters, 'reviewId') ?? query.selectionId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== CONTRACT_HEALTH_CHECK_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('Contract view refreshed', '合同体检视图已刷新')
      }

      if (actionKey === 'create_review') {
        const review = await this.service.createReview(scope, {
          contractName: requireStringInput(request.input, 'contractName', '合同名称不能为空。'),
          contractType: getContractTypeInput(request.input, 'contractType'),
          rawText: requireStringInput(request.input, 'rawText', '合同正文不能为空。'),
          counterparty: getStringInput(request.input, 'counterparty'),
          xpertId: getActionXpertId(context, request.input),
          agentKey: getStringInput(request.input, 'agentKey')
        })
        return {
          ...success('Contract review created', '合同体检记录已创建'),
          data: review
        }
      }

      if (actionKey === 'start_review') {
        const reviewId = requireStringInput(request.input, 'reviewId', '合同体检记录 id 不能为空。')
        await this.service.createReviewJobs(scope, reviewId)
        const command = this.service.buildPipelineCommand(scope, reviewId)
        return {
          ...success('Contract health check started', '合同体检已启动'),
          data: command,
          refresh: false
        }
      }

      if (actionKey === 'confirm_risk_decision') {
        const risk = await this.service.confirmRiskDecision(scope, {
          reviewId: requireStringInput(request.input, 'reviewId', '合同体检记录 id 不能为空。'),
          riskId: requireStringInput(request.input, 'riskId', '风险项 id 不能为空。'),
          decision: getDecisionInput(request.input, 'decision'),
          customText: getStringInput(request.input, 'customText'),
          note: getStringInput(request.input, 'note')
        })
        return {
          ...success('Risk decision saved', '风险处理已保存'),
          data: risk
        }
      }

      if (actionKey === 'complete_review') {
        const review = await this.service.completeReview(
          scope,
          requireStringInput(request.input, 'reviewId', '合同体检记录 id 不能为空。')
        )
        return {
          ...success('Report saved', '体检报告已保存'),
          data: review
        }
      }

      if (actionKey === 'retry_pipeline') {
        const result = await this.service.retryPipeline(scope, {
          reviewId: requireStringInput(request.input, 'reviewId', '合同体检记录 id 不能为空。'),
          stage: getStageInput(request.input, 'stage')
        })
        return {
          ...success('Retry started', '已开始重试失败环节'),
          data: result,
          refresh: false
        }
      }

      if (actionKey === 'delete_review') {
        const result = await this.service.deleteReview(
          scope,
          requireStringInput(request.input, 'reviewId', '合同体检记录 id 不能为空。')
        )
        return {
          ...success('Contract review deleted', '合同体检记录已删除'),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, '操作失败')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  if (context.hostType === 'project') {
    return slot === PROJECT_DETAIL_SECTIONS_SLOT
  }

  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }

  return false
}

function scopeFromContext(context: XpertResolvedViewHostContext): ContractScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    userId: context.userId
  }
}

function getActionXpertId(context: XpertResolvedViewHostContext, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'xpertId') ?? (context.hostType === 'agent' ? context.hostId : undefined)
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

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  const value = getStringInput(input, key)
  if (!value) {
    throw new Error(message)
  }
  return value
}

function getContractTypeInput(input: XpertViewActionRequest['input'], key: string): ContractType {
  const value = getStringInput(input, key)
  if (value === 'purchase' || value === 'cooperation' || value === 'sales') {
    return value
  }
  return 'sales'
}

function getDecisionInput(input: XpertViewActionRequest['input'], key: string): ContractRiskDecision {
  const value = getStringInput(input, key)
  if (value === 'accepted' || value === 'ignored' || value === 'custom' || value === 'pending') {
    return value
  }
  return 'pending'
}

function getStageInput(input: XpertViewActionRequest['input'], key: string): ContractReviewJobType | undefined {
  const value = getStringInput(input, key)
  if (value === 'extract' || value === 'review' || value === 'draft' || value === 'summary') {
    return value
  }
  return undefined
}

function getStringParameter(
  parameters: XpertViewQuery['parameters'] | undefined,
  key: string
) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
