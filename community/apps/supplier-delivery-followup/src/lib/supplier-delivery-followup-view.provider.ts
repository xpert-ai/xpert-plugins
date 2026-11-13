import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import type {
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  RequestContext,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { DELIVERY_FEATURE, DELIVERY_TOOL_NAMES, DELIVERY_WORKBENCH_KEY, PLUGIN_NAME } from './constants'
import { DEMO_ORDER_LINES } from './demo-data'
import { DeliveryDomainError } from './domain-error'
import { parseCommandText, scopeValues } from './domain-utils'
import type { ChangeProposal } from './entities'
import { SupplierDeliveryFollowupService } from './supplier-delivery-followup.service'
import type { DeliveryScope } from './types'
import type {
  OrderLineDetailDto,
  OrderLineSummaryDto,
  PageDto,
  ProposalDto,
  ReplyDetailDto,
  ReplySummaryDto,
  WorkbenchActionKey,
  WorkbenchActionResult
} from './workbench-contract'

const ENTRY = 'supplier-delivery-workbench'
const requireFromHere = createRequire(__filename)
const title = { en_US: 'Supplier delivery follow-up', zh_Hans: '供应商交期跟单' }
const actions: Array<{ key: WorkbenchActionKey; label: { en_US: string; zh_Hans: string } }> = [
  { key: 'import_demo_data', label: { en_US: 'Import demo orders', zh_Hans: '导入示例订单' } },
  { key: 'create_reply', label: { en_US: 'Save reply', zh_Hans: '保存回复' } },
  { key: 'request_parse', label: { en_US: 'Parse with AI', zh_Hans: '让 AI 解析' } },
  { key: 'resend_parse', label: { en_US: 'Resend to assistant', zh_Hans: '重新发送给助手' } },
  { key: 'retry_parse', label: { en_US: 'Retry parsing', zh_Hans: '重试解析' } },
  { key: 'decide_proposal', label: { en_US: 'Review proposal', zh_Hans: '审核提议' } },
  { key: 'confirm_reply', label: { en_US: 'Confirm changes', zh_Hans: '确认变更' } }
]

@Injectable()
@ViewExtensionProvider(DELIVERY_WORKBENCH_KEY)
export class SupplierDeliveryFollowupViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: SupplierDeliveryFollowupService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [
      {
        key: DELIVERY_WORKBENCH_KEY,
        title,
        hostType: 'agent',
        slot,
        refreshable: true,
        activation: { requiredFeatures: [DELIVERY_FEATURE] },
        ...(slot === 'agent.workbench.fixed'
          ? {
              workbench: { fixed: true, menu: { enabled: true, label: title, order: 50 } }
            }
          : {}),
        source: { provider: DELIVERY_WORKBENCH_KEY, plugin: PLUGIN_NAME },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: ENTRY },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsParameters: true,
            supportsPagination: true,
            supportsSearch: true,
            defaultPageSize: 100
          },
          cache: { enabled: false }
        },
        actions: actions.map((action) => ({ ...action, actionType: 'invoke' })),
        clientCommands: [{ key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND }],
        hostEvents: {
          subscriptions: [
            {
              key: 'supplier-delivery-tool-completed',
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [...DELIVERY_TOOL_NAMES] },
              action: { type: 'forward', debounceMs: 800 }
            }
          ]
        }
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== DELIVERY_WORKBENCH_KEY || component.entry !== ENTRY) {
      throw new Error('unsupported_component')
    }
    // __dirname resolves inside dist/lib in the installed package. Never use cwd/source fallbacks.
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(__dirname, 'remote-components', ENTRY, 'app.js'), 'utf8'),
      readFile(join(__dirname, 'remote-components', ENTRY, 'app.css'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({ title: title.en_US, lang: 'en', appScript, appCss, reactUmd, reactDomUmd }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult & { error?: { code: string } }> {
    if (viewKey !== DELIVERY_WORKBENCH_KEY) return { error: { code: 'unsupported_view' } }
    try {
      const scope = scopeFromContext(context)
      const input = { page: query.page, pageSize: query.pageSize ?? 100 }
      const id = typeof query.parameters?.id === 'string' ? query.parameters.id : ''
      switch (query.parameters?.table) {
        case 'overview':
          return { meta: await this.service.getWorkbenchOverview(scope) }
        case 'replies': {
          return {
            meta: (await this.service.listWorkbenchReplySummaries(input, scope)) satisfies PageDto<ReplySummaryDto>
          }
        }
        case 'reply': {
          // Decisions and their revision come from one read, so the revision always matches what is displayed.
          const reply = await this.service.getReplyForReview(id, scope)
          const proposals = await Promise.all(reply.proposals.map((proposal) => this.proposalDto(proposal, scope)))
          return {
            meta: {
              id: reply.id,
              revision: reply.reviewRevision,
              rawText: reply.rawText,
              status: reply.status,
              confirmationInProgress: reply.status !== 'confirmed' && Boolean(reply.confirmationStartedAt),
              parseTimedOut: reply.parseTimedOut,
              parseAttempt: reply.parseAttempt,
              parseRequestedAt: reply.parseRequestedAt,
              failureCode: reply.failureCode,
              failureMessage: reply.failureMessage,
              createdAt: reply.createdAt,
              confirmedAt: reply.confirmedAt,
              confirmedBy: reply.confirmedBy,
              confirmedByName: reply.confirmedByName ?? null,
              proposals
            } satisfies ReplyDetailDto
          }
        }
        case 'orderLines': {
          const page = await this.service.listWorkbenchOrderLines({ ...input, search: query.search }, scope)
          return { meta: { ...page, items: page.items.map(orderSummary) } satisfies PageDto<OrderLineSummaryDto> }
        }
        case 'orderLine': {
          const line = await this.service.getOrderLine(id, scope)
          return {
            meta: {
              ...orderSummary(line),
              revision: line.revision,
              changes: line.changeLogs.map((log) => ({
                id: log.id,
                replyId: log.replyId,
                oldDate: log.oldDate,
                newDate: log.newDate,
                aiDate: log.aiDate,
                oldQuantity: log.oldQuantity ?? null,
                newQuantity: log.newQuantity ?? null,
                batches: log.batches,
                confirmedBy: log.confirmedBy,
                confirmedByName: log.confirmedByName ?? null,
                confirmedAt: log.confirmedAt
              }))
            } satisfies OrderLineDetailDto
          }
        }
        default:
          return { error: { code: 'unsupported_query' } }
      }
    } catch (error) {
      if (error instanceof DeliveryDomainError) return { error: { code: error.code } }
      throw error
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<WorkbenchActionResult<WorkbenchActionKey>> {
    if (viewKey !== DELIVERY_WORKBENCH_KEY) return { success: false, code: 'unsupported_view' }
    try {
      const scope = scopeFromContext(context)
      const input = request.input ?? {}
      const targetId = request.targetId ?? ''
      switch (actionKey) {
        case 'import_demo_data': {
          const { created } = await this.service.importDemoData(scope)
          return { success: true, data: { created, skipped: DEMO_ORDER_LINES.length - created } }
        }
        case 'create_reply': {
          const { reply, created } = await this.service.createReply(
            typeof input.rawText === 'string' ? input.rawText : '',
            scope
          )
          return { success: true, data: { replyId: reply.id, created } }
        }
        case 'request_parse':
        case 'resend_parse':
        case 'retry_parse': {
          const reply =
            actionKey === 'request_parse'
              ? await this.service.requestParse(targetId, scope)
              : actionKey === 'resend_parse'
                ? await this.service.resendParse(targetId, scope)
                : await this.service.retryParse(targetId, scope)
          return {
            success: true,
            data: { replyId: reply.id, parseAttempt: reply.parseAttempt },
            command: {
              commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
              payload: { newThread: true, text: parseCommandText(reply, input.locale) }
            }
          }
        }
        case 'decide_proposal': {
          const decision = input.decision
          if (decision !== 'accepted' && decision !== 'edited' && decision !== 'rejected')
            throw new DeliveryDomainError('invalid_decision')
          if (input.finalDate !== undefined && typeof input.finalDate !== 'string')
            throw new DeliveryDomainError('invalid_date')
          if (input.finalQuantity !== undefined && typeof input.finalQuantity !== 'number')
            throw new DeliveryDomainError('invalid_quantity')
          const proposal = await this.service.decideProposal(
            targetId,
            decision,
            input.finalDate,
            input.finalQuantity,
            scope
          )
          return { success: true, data: { proposalId: proposal.id, replyId: proposal.replyId } }
        }
        case 'confirm_reply': {
          const reply = await this.service.getReply(targetId, scope)
          // The revision covers every decision, so a window that missed another reviewer's change is rejected.
          // A confirmed or already frozen reply resumes idempotently whatever revision a retried request carries.
          const resuming = reply.status === 'confirmed' || Boolean(reply.confirmationStartedAt)
          if (!resuming && input.expectedRevision !== (await this.service.reviewRevision(reply.id, scope))) {
            throw new DeliveryDomainError('concurrent_change')
          }
          const { appliedCount } = await this.service.confirmReply(reply.id, scope.userId, scope, currentActorName())
          return { success: true, data: { replyId: reply.id, appliedCount } }
        }
        default:
          return { success: false, code: 'unsupported_action' }
      }
    } catch (error) {
      if (!(error instanceof DeliveryDomainError)) throw error
      const params: Record<string, string | number> = {}
      for (const [key, value] of Object.entries(error.params)) {
        if (typeof value === 'string' || typeof value === 'number') params[key] = value
      }
      return { success: false, code: error.code, ...(Object.keys(params).length ? { params } : {}) }
    }
  }

  private async proposalDto(proposal: ChangeProposal, scope: DeliveryScope): Promise<ProposalDto> {
    const line = await this.service.getOrderLine(proposal.orderLineId, scope)
    return {
      id: proposal.id,
      orderLineId: line.id,
      poNumber: line.poNumber,
      lineNo: line.lineNo,
      supplierName: line.supplierName,
      materialName: line.materialName,
      unit: line.unit,
      orderedQuantity: line.quantity,
      originalDate: line.originalDate,
      baseDate: proposal.orderLineDate,
      currentDate: line.promisedDate,
      changeType: proposal.changeType,
      proposedDate: proposal.proposedDate,
      proposedQuantity: proposal.proposedQuantity,
      batches: proposal.batches,
      reason: proposal.reason,
      evidence: proposal.evidence,
      confidence: proposal.confidence,
      decision: proposal.decision,
      finalDate: proposal.finalDate,
      finalQuantity: proposal.finalQuantity,
      // Only a proposal not yet written to its order can be stale; once written, later changes by other replies are history.
      stale:
        proposal.confirmationState !== 'confirmed' &&
        line.revision !== proposal.orderLineRevision &&
        line.lastAppliedProposalId !== proposal.id
    }
  }
}

function currentActorName(): string | null {
  try {
    const user = RequestContext.currentUser(false)
    if (!user) return null
    const fullName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ')
    return user.name?.trim() || user.fullName?.trim() || fullName || user.username?.trim() || user.email?.trim() || null
  } catch {
    // A missing request user must not prevent confirmation with the trusted view scope.
    return null
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): DeliveryScope {
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
  scopeValues(scope)
  return scope
}

function orderSummary(line: OrderLineSummaryDto): OrderLineSummaryDto {
  return {
    id: line.id,
    poNumber: line.poNumber,
    lineNo: line.lineNo,
    supplierName: line.supplierName,
    materialCode: line.materialCode,
    materialName: line.materialName,
    quantity: line.quantity,
    unit: line.unit,
    originalDate: line.originalDate,
    promisedDate: line.promisedDate,
    delayDays: line.delayDays
  }
}

async function readPackageFile(packageName: string, file: string) {
  return readFile(join(dirname(requireFromHere.resolve(`${packageName}/package.json`)), file), 'utf8')
}
