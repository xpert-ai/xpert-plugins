import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
  I18nObject,
  IconDefinition,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  ACTION_BEGIN_EXTRACTION,
  ACTION_CREATE_CASE,
  ACTION_DELETE_CASE,
  ACTION_SAVE_REVIEW,
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  CONTRACT_REVIEW_FEATURE,
  CONTRACT_REVIEW_ICON,
  CONTRACT_REVIEW_PLUGIN_NAME,
  CONTRACT_REVIEW_PROVIDER_KEY,
  CONTRACT_REVIEW_REMOTE_ENTRY_KEY,
  CONTRACT_REVIEW_TOOL_NAMES,
  CONTRACT_REVIEW_WORKBENCH_VIEW_KEY
} from './constants'
import { ContractReviewService } from './contract-review.service'
import type { ContractReviewClauseDecision, ContractReviewScope, ContractHumanDecision } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const CONTRACT_REVIEW_VIEW_ICON = {
  type: 'svg',
  value: CONTRACT_REVIEW_ICON,
  alt: 'Contract Review'
} satisfies IconDefinition

const createCaseInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', title: text('Contract title', '合同名称') },
    counterparty: { type: 'string', title: text('Counterparty', '相对方') },
    contractText: { type: 'string', title: text('Contract text', '合同正文') }
  },
  required: ['title', 'contractText']
} satisfies JsonSchemaObjectType

const caseIdInputSchema = {
  type: 'object',
  properties: {
    caseId: { type: 'string', title: text('Case', '审查单') }
  },
  required: ['caseId']
} satisfies JsonSchemaObjectType

const saveReviewInputSchema = {
  type: 'object',
  properties: {
    caseId: { type: 'string', title: text('Case', '审查单') },
    decisions: {
      type: 'array',
      title: text('Decisions', '人工处置'),
      items: {
        type: 'object',
        properties: {
          clauseId: { type: 'string' },
          decision: { type: 'string' },
          conclusion: { type: 'string' },
          note: { type: 'string' }
        },
        required: ['clauseId', 'decision']
      }
    },
    allowPartial: { type: 'boolean', title: text('Allow partial', '允许部分保存') }
  },
  required: ['caseId', 'decisions']
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(CONTRACT_REVIEW_PROVIDER_KEY)
export class ContractReviewViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ContractReviewService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: CONTRACT_REVIEW_WORKBENCH_VIEW_KEY,
        title: text('Contract Review Workbench', '合同条款审查台'),
        description: text(
          'Paste a contract, let the Agent extract the key clauses, then confirm or correct each one before it is saved.',
          '粘贴合同，由 Agent 抽取关键条款，人工逐条确认或修正后再落库。'
        ),
        icon: CONTRACT_REVIEW_VIEW_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 28 : 22,
        refreshable: true,
        activation: {
          requiredFeatures: [CONTRACT_REVIEW_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Contract Review', '合同审查'),
                  order: 28,
                  icon: CONTRACT_REVIEW_VIEW_ICON
                }
              }
            }
          : {}),
        source: {
          provider: CONTRACT_REVIEW_PROVIDER_KEY,
          plugin: CONTRACT_REVIEW_PLUGIN_NAME
        },
        parameters: [
          {
            key: 'caseId',
            label: text('Case', '审查单'),
            type: 'string'
          }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: CONTRACT_REVIEW_REMOTE_ENTRY_KEY
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
            supportsSort: false,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: this.service.pluginConfig().defaultPageSize
          },
          cache: {
            enabled: false
          }
        },
        clientCommands: [
          {
            key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            label: text('Ask the Agent to review', '让 Agent 审查'),
            description: text(
              'Send the contract to the current conversation so the Agent can extract the key clauses.',
              '把合同发给当前对话，由 Agent 抽取关键条款。'
            )
          }
        ],
        hostEvents: {
          subscriptions: [
            {
              key: 'contract-review-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...CONTRACT_REVIEW_TOOL_NAMES]
              },
              action: {
                type: 'forward',
                debounceMs: 600
              }
            }
          ]
        },
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: ACTION_CREATE_CASE,
            label: text('New review', '新建审查'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: createCaseInputSchema
          },
          {
            key: ACTION_BEGIN_EXTRACTION,
            label: text('Ask the Agent to review', '让 Agent 审查'),
            icon: 'ri-sparkling-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: caseIdInputSchema
          },
          {
            key: ACTION_SAVE_REVIEW,
            label: text('Save review', '保存审查结论'),
            icon: 'ri-save-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: saveReviewInputSchema
          },
          {
            key: ACTION_DELETE_CASE,
            label: text('Delete review', '删除审查单'),
            icon: 'ri-delete-bin-line',
            actionType: 'invoke',
            inputSchema: caseIdInputSchema,
            confirm: {
              title: text('Delete this review?', '删除这张审查单？'),
              message: text(
                'The contract text and every recorded clause will be removed. This cannot be undone.',
                '合同正文与该审查单下的全部条款都会被删除，且不可恢复。'
              )
            }
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
    if (viewKey !== CONTRACT_REVIEW_WORKBENCH_VIEW_KEY || component.entry !== CONTRACT_REVIEW_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported contract review component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', CONTRACT_REVIEW_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const appCss = await readFile(
      join(__dirname, 'remote-components', CONTRACT_REVIEW_REMOTE_ENTRY_KEY, 'app.css'),
      'utf8'
    )
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Contract Review Workbench',
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
    if (viewKey !== CONTRACT_REVIEW_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const result = await this.service.getViewData(scopeFromContext(context), {
      caseId: getStringParameter(query.parameters, 'caseId'),
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    // 宿主约定的信封：左栏用 items，右栏用 item
    return {
      items: result.list.items,
      total: result.list.total,
      item: result.selected ?? undefined,
      summary: {
        page: result.list.page,
        pageSize: result.list.pageSize
      }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== CONTRACT_REVIEW_WORKBENCH_VIEW_KEY) {
        return failure('Unsupported contract review view action', '不支持的合同审查视图操作')
      }
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('Contract review view refreshed', '合同审查视图已刷新')
      }

      if (actionKey === ACTION_CREATE_CASE) {
        const title = getStringInput(request.input, 'title')
        const contractText = getStringInput(request.input, 'contractText')
        if (!title) return failure('Contract title is required', '缺少合同名称')
        if (!contractText) return failure('Contract text is required', '缺少合同正文')
        const created = await this.service.createCase(scope, {
          title,
          counterparty: getStringInput(request.input, 'counterparty'),
          contractText
        })
        return {
          success: true,
          message: text('Contract review case created', '审查单已创建'),
          refresh: true,
          data: created
        }
      }

      if (actionKey === ACTION_BEGIN_EXTRACTION) {
        const caseId = request.targetId ?? getStringInput(request.input, 'caseId')
        if (!caseId) return failure('Case id is required', '缺少审查单 id')
        const detail = await this.service.beginExtraction(scope, caseId)

        // 关键一步：本插件不直接调用模型。AI 由 Agent 承担，
        // 这里把审查请求交给当前对话，模型再回调本插件的 record_clause 工具写回条款。
        const prompt = buildExtractionPrompt(detail.title, caseId)
        return {
          success: true,
          message: text(
            'Review request sent to the Agent. The clauses it records will appear here for you to confirm.',
            '已把审查请求发给 Agent，它登记的条款会出现在这里等待你确认。'
          ),
          refresh: true,
          data: {
            caseId,
            attempt: detail.extractionAttempts,
            clientCommand: {
              commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
              payload: {
                text: prompt,
                state: {
                  contractReview: {
                    intent: 'extract_clauses',
                    caseId
                  }
                }
              }
            }
          }
        }
      }

      if (actionKey === ACTION_SAVE_REVIEW) {
        const caseId = request.targetId ?? getStringInput(request.input, 'caseId')
        if (!caseId) return failure('Case id is required', '缺少审查单 id')
        const decisions = getDecisions(request.input)
        const result = await this.service.saveReview(scope, {
          caseId,
          decisions,
          allowPartial: request.input?.['allowPartial'] === true
        })
        return {
          success: true,
          message: text(result.message, result.message),
          refresh: true,
          data: result
        }
      }

      if (actionKey === ACTION_DELETE_CASE) {
        const caseId = request.targetId ?? getStringInput(request.input, 'caseId')
        if (!caseId) return failure('Case id is required', '缺少审查单 id')
        const result = await this.service.deleteCase(scope, caseId)
        return {
          success: true,
          message: text('Contract review case deleted', '审查单已删除'),
          refresh: true,
          data: result
        }
      }

      return failure('Unsupported contract review action', '不支持的合同审查操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Contract review action failed'
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

/**
 * 交给 Agent 的指令。刻意写成「先取原文、再逐类抽取、最后宣告结束」的有序流程，
 * 并要求原文摘录必须逐字引用 —— 人工确认时才有据可查。
 */
export function buildExtractionPrompt(title: string, caseId: string) {
  return [
    `请审查合同《${title}》（审查单 id: ${caseId}）。`,
    '',
    '步骤：',
    `1. 调用 contract_review_get_case（caseId=${caseId}）拿到合同全文。`,
    '2. 逐字阅读全文，针对以下四类条款各抽取一条：付款条件(payment)、交付(delivery)、质保(warranty)、违约责任(liability)。',
    '3. 每抽到一条，立刻调用 contract_review_record_clause 登记，其中 excerpt 必须是合同原文的逐字摘录（不要改写、不要编造）。',
    '4. 四类都处理完后，调用 contract_review_mark_extraction 并把 outcome 设为 success。',
    '',
    '注意：合同中确实不存在的条款类型不要登记，也不要为了凑数而编造。'
  ].join('\n')
}

function scopeFromContext(context: XpertResolvedViewHostContext): ContractReviewScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId
  }
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

function getDecisions(input: Record<string, unknown> | null | undefined): ContractReviewClauseDecision[] {
  const raw = input?.['decisions']
  if (!Array.isArray(raw)) return []
  const decisions: ContractReviewClauseDecision[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const clauseId = typeof record.clauseId === 'string' ? record.clauseId.trim() : ''
    const decision = typeof record.decision === 'string' ? (record.decision.trim() as ContractHumanDecision) : ''
    if (!clauseId || !decision) continue
    decisions.push({
      clauseId,
      decision,
      conclusion: typeof record.conclusion === 'string' ? record.conclusion : null,
      note: typeof record.note === 'string' ? record.note : null
    })
  }
  return decisions
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

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}
