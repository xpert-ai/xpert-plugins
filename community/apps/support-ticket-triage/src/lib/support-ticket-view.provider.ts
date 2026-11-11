import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  I18nObject, XpertExtensionViewManifest, XpertRemoteComponentEntry, XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery
} from '@xpert-ai/contracts'
import { renderRemoteReactIframeHtml, ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { FEATURE_KEY, PLUGIN_NAME, REMOTE_ENTRY_KEY, TICKET_TOOL_NAMES, VIEW_KEY, VIEW_PROVIDER_KEY } from './constants.js'
import { SupportTicketService } from './support-ticket.service.js'
import type { TicketScope } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const requireFromHere = createRequire(import.meta.url)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(VIEW_PROVIDER_KEY)
export class SupportTicketViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: SupportTicketService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== 'agent.workbench.main' && slot !== 'agent.workbench.fixed') return []
    return [{
      key: VIEW_KEY,
      title: text('Ticket Triage', '售后工单分诊台'),
      description: text('Review AI analysis and approve or reject reply drafts.', '复核 AI 分诊结果，并批准或驳回复草稿。'),
      icon: { type: 'font', value: 'ri-customer-service-2-line' },
      hostType: 'agent', slot, order: 20, refreshable: true,
      activation: { requiredFeatures: [FEATURE_KEY] },
      source: { provider: VIEW_PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: REMOTE_ENTRY_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: false, supportsSearch: true, supportsSelection: true, supportsParameters: false }, cache: { enabled: false } },
      hostEvents: { subscriptions: [{ key: 'ticket-tools-completed', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: [...TICKET_TOOL_NAMES] }, action: { type: 'forward', debounceMs: 500 } }] },
      actions: [
        { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        { key: 'create_ticket', label: text('Create ticket', '创建工单'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'approve', label: text('Approve', '批准'), icon: 'ri-check-line', placement: 'row', actionType: 'invoke' },
        { key: 'reject', label: text('Reject', '驳回'), icon: 'ri-close-line', placement: 'row', actionType: 'invoke' },
        { key: 'simulate_failure', label: text('Simulate failure', '模拟失败'), icon: 'ri-error-warning-line', placement: 'row', actionType: 'invoke' },
        { key: 'retry', label: text('Retry', '重试'), icon: 'ri-restart-line', placement: 'row', actionType: 'invoke' }
      ],
      clientCommands: [{ key: 'assistant.chat.send_message', label: text('Ask Assistant to analyse', '让 Assistant 分析') }]
    }]
  }

  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== VIEW_KEY || component.entry !== REMOTE_ENTRY_KEY) return { html: '<p>Unsupported view.</p>', contentType: 'text/html; charset=utf-8' }
    const appScript = await readFile(join(here, 'remote-components', REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return { html: renderRemoteReactIframeHtml({ title: 'Support Ticket Triage', lang: 'zh-Hans', reactUmd: react, reactDomUmd: reactDom, appScript }), contentType: 'text/html; charset=utf-8' }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== VIEW_KEY) return {}
    const items = await this.service.list(scopeFromContext(context), query.search)
    return { items, total: items.length, meta: { pending: items.filter((item) => item.status === 'pending_ai').length, review: items.filter((item) => item.status === 'awaiting_review').length, failed: items.filter((item) => item.status === 'failed').length } }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    if (viewKey !== VIEW_KEY) return failure('Unsupported view')
    const id = request.targetId
    if (actionKey === 'refresh') return success('Refreshed')
    if (!id) return failure('A ticket must be selected.')
    const scope = scopeFromContext(context)
    try {
      if (actionKey === 'create_ticket') {
        const input = request.input ?? {}
        const data = await this.service.create(scope, {
          customerName: requiredInput(input, 'customerName'),
          customerEmail: optionalInput(input, 'customerEmail'),
          subject: requiredInput(input, 'subject'),
          description: requiredInput(input, 'description')
        })
        return { ...success('Ticket created and queued for AI analysis.'), data }
      }
      if (actionKey === 'approve') return { ...success('Reply draft approved.'), data: await this.service.review(scope, id, 'approved', inputString(request, 'comment')) }
      if (actionKey === 'reject') return { ...success('Reply draft rejected.'), data: await this.service.review(scope, id, 'rejected', inputString(request, 'comment')) }
      if (actionKey === 'simulate_failure') return { ...success('Failure recorded.'), data: await this.service.recordFailure(scope, id, 'Simulated model timeout for retry demonstration.') }
      if (actionKey === 'retry') return { ...success('Ticket returned to the AI queue.'), data: await this.service.retry(scope, id) }
      return failure('Unsupported action')
    } catch (error) { return failure(error instanceof Error ? error.message : 'Action failed') }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): TicketScope {
  return { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, assistantId: context.hostId }
}
function inputString(request: XpertViewActionRequest, key: string) { const value = request.input?.[key]; return typeof value === 'string' ? value : undefined }
function requiredInput(input: Record<string, unknown>, key: string) { const value = input[key]; if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`); return value.trim() }
function optionalInput(input: Record<string, unknown>, key: string) { const value = input[key]; return typeof value === 'string' && value.trim() ? value.trim() : undefined }
async function readPackageFile(packageName: string, relativePath: string) {
  const packageJson = requireFromHere.resolve(`${packageName}/package.json`)
  return readFile(join(dirname(packageJson), relativePath), 'utf8')
}
function success(message: string): XpertViewActionResult { return { success: true, message: text(message, message), refresh: true } }
function failure(message: string): XpertViewActionResult { return { success: false, message: text(message, message) } }
