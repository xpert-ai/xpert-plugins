import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Injectable, NotFoundException } from '@nestjs/common'
import type { XpertRemoteComponentViewSchema, XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewQuery } from '@xpert-ai/contracts'
import { renderRemoteReactIframeHtml, ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { TicketService } from './ticket.service.js'
import { TicketError } from './domain.js'
import { FEATURE, PROVIDER, PLUGIN, text } from './constants.js'
const VIEW = 'tickets'
const require = createRequire(import.meta.url)
const input = z.object({commandId: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(12000)}).strict()
const attemptInput = z.object({attempt: z.number().int().positive()}).strict()
const confirmInput = attemptInput.extend({reply: z.string().trim().min(1).max(12000)}).strict()
const statusLabels = {draft: '待分析', analyzing: '分析中', analysis_failed: '分析失败／可重试', awaiting_review: '待人工审核', confirmed: '已确认'}
const categoryLabels = {product: '产品问题', delivery: '物流问题', refund: '退款问题', other: '其他'}
const priorityLabels = {low: '低', normal: '普通', high: '高'}
@Injectable()
@ViewExtensionProvider(PROVIDER)
export class TicketView implements IXpertViewExtensionProvider {
  constructor(private readonly service: TicketService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench', 'agent.workbench.main'].includes(slot)) return []
    return [{key: VIEW, title: text('Aftersales tickets', '售后工单'), hostType: 'agent', slot,
      source: {provider: PROVIDER, plugin: PLUGIN}, refreshable: true,
      activation: {requiredFeatures: [FEATURE]},
      view: {type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: {isolation: 'iframe', entry: 'aftersales_ticket__workbench'}, dataSource: {mode: 'platform'}},
      clientCommands: [{key: 'assistant.chat.send_message', label: text('Analyze ticket', '分析工单')}],
      hostEvents: {subscriptions: [{key: 'ticket-analysis-completed', event: 'assistant.tool.completed',
        filter: {sources: ['chatkit'], toolNames: ['aftersales_begin_analysis','aftersales_save_analysis','aftersales_report_failure']},
        action: {type: 'refresh-and-forward', debounceMs: 1000}}]},
      dataSource: {mode: 'platform', querySchema: {supportsPagination: true, defaultPageSize: 20}, cache: {enabled: false}},
      actions: [{key: 'create', label: text('New ticket', '新建工单'), actionType: 'invoke', placement: 'toolbar',
        requiredHostAccess: 'edit', inputSchema: {type: 'object', properties: {
          commandId: {type: 'string', title: text('Request ID', '请求编号')},
          title: {type: 'string', title: text('Title', '标题'), maxLength: 160},
          description: {type: 'string', title: text('Customer issue', '客户问题'), maxLength: 12000}
        }, required: ['commandId', 'title', 'description'], additionalProperties: false}},
        {key: 'confirm', label: text('Review and confirm', '审核并确认回复'), actionType: 'invoke', placement: 'row',
          requiredHostAccess: 'edit', inputDefaults: 'target', inputSchema: {type: 'object', properties: {
            attempt: {type: 'number', title: text('Analysis version', '分析版本（请勿修改）')},
            reply: {type: 'string', title: text('Final reply (saved only)', '最终回复（仅保存，不发送）'), maxLength: 12000}
          }, required: ['attempt', 'reply'], additionalProperties: false}},
        {key: 'interrupt', label: text('Mark interrupted', '标记分析中断'), actionType: 'invoke', placement: 'row',
          requiredHostAccess: 'edit', inputDefaults: 'target',
          confirm: {message: text('Invalidate this attempt? Late results will be rejected. Then ask the assistant to retry.', '将废弃本次分析并拒绝其迟到结果，之后可让助手重试。确定继续？')},
          inputSchema: {type: 'object', properties: {attempt: {type: 'number', title: text('Analysis version', '分析版本（请勿修改）')}}, required: ['attempt'], additionalProperties: false}}
      ]}]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    if (!this.supports(context) || key !== VIEW || component.entry !== 'aftersales_ticket__workbench') throw new TicketError('unsupported_view')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(new URL('./remote/app.js', import.meta.url), 'utf8'),
      readFile(new URL('./remote/style.css', import.meta.url), 'utf8'),
      readFile(join(dirname(require.resolve('react/package.json')), 'umd/react.production.min.js'), 'utf8'),
      readFile(join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.production.min.js'), 'utf8')
    ])
    return {html: renderRemoteReactIframeHtml({title: 'Aftersales tickets', lang: 'zh-Hans', appScript, appCss, reactUmd, reactDomUmd}), contentType: 'text/html; charset=utf-8' as const}
  }
  private scope(context: XpertResolvedViewHostContext) {
    return {tenantId: context.tenantId, organizationId: context.organizationId ?? '', ownerId: context.userId}
  }
  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    if (!this.supports(context) || key !== VIEW) throw new TicketError('unsupported_view')
    const result = await this.service.list(this.scope(context), query.page)
    return {...result, items: result.items.map(item => ({...item, statusLabel: statusLabels[item.status],
      categoryLabel: item.analysis ? categoryLabels[item.analysis.category] : '',
      priorityLabel: item.analysis ? priorityLabels[item.analysis.priority] : '',
      questionsText: item.analysis?.questions.join('\n') ?? '', reply: item.finalReply ?? item.analysis?.replyDraft ?? ''}))}
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    if (!this.supports(context) || key !== VIEW) throw new TicketError('unsupported_view')
    try {
      const scope = this.scope(context)
      if (action === 'create') {
        const {commandId, ...fields} = input.parse(request.input)
        const ticket = await this.service.create(scope, fields, commandId)
        return {success: true, refresh: true, data: {id: ticket.id}, message: text('Saved. Ask the assistant to analyze this ticket.', '工单已保存，请在对话中让助手分析此工单。')}
      }
      const id = z.string().uuid().parse(request.targetId)
      if (action === 'confirm') {
        const {attempt, reply} = confirmInput.parse(request.input)
        const data = await this.service.confirm(scope, id, attempt, reply)
        return {success: true, refresh: true, data, message: text('Reply confirmed and saved. No message was sent.', '回复已确认并保存，未向客户发送。')}
      }
      if (action === 'interrupt') {
        const {attempt} = attemptInput.parse(request.input)
        const data = await this.service.failAnalysis(scope, id, attempt)
        return {success: true, refresh: true, data, message: text('Attempt invalidated. Ask the assistant to retry this ticket.', '本次分析已废弃，请在对话中让助手重试同一工单。')}
      }
      throw new TicketError('unsupported_action')
    } catch (error) {
      if (error instanceof TicketError || error instanceof z.ZodError || error instanceof NotFoundException) {
        const code = error instanceof TicketError ? error.code : error instanceof z.ZodError ? 'invalid_input' : 'ticket_not_found'
        return {success: false, refresh: true, failure: {kind: 'business', code},
          message: text('Operation rejected. Refresh the ticket and check its state and input.', '操作未完成，请刷新工单并检查状态及表单。只有待审核工单可确认，只有分析中的工单可标记中断。')}
      }
      throw error
    }
  }
}