import { Injectable } from '@nestjs/common'
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  type XpertExtensionViewManifest, type XpertRemoteComponentEntry, type XpertRemoteComponentViewSchema,
  type XpertResolvedViewHostContext, type XpertViewActionRequest, type XpertViewActionResult,
} from '@xpert-ai/contracts'
import { renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { readFile } from 'node:fs/promises'
import { entryKey, feature, pluginName, providerKey, viewKey } from './constants.js'
import { action, confirmTicket, createTicket, reference, reviseTicket, TicketError } from './contracts.js'
import { viewScope } from './scope.js'
import { TicketService } from './ticket.service.js'
import { z } from 'zod/v3'

const title = { en_US: 'Ticket triage', zh_Hans: '工单分诊' }
const icon = { type: 'font', value: 'ri-customer-service-2-line' } as const
const remoteDir = new URL('./remote/', import.meta.url)
const labels = {
  [action.create]: { en_US: 'Create ticket', zh_Hans: '新建工单' },
  [action.begin]: { en_US: 'Run triage', zh_Hans: '开始分诊' },
  [action.dispatchFailed]: { en_US: 'Record dispatch failure', zh_Hans: '记录提交失败' },
  [action.confirm]: { en_US: 'Confirm triage', zh_Hans: '确认分诊' },
}

@Injectable()
@ViewExtensionProvider(providerKey)
export class SupportTicketTriageView implements IXpertViewExtensionProvider {
  constructor(private readonly tickets: TicketService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent' && !!context.workspaceId
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [{
      key: viewKey, title, icon, slot, hostType: 'agent', order: 20, refreshable: false,
      source: { provider: providerKey, plugin: pluginName },
      activation: { requiredFeatures: [feature] },
      ...(slot === 'agent.workbench.fixed' ? {
        workbench: { fixed: true, menu: { enabled: true, label: title, order: 20, icon } },
      } : {}),
      view: {
        type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: entryKey }, dataSource: { mode: 'platform' },
      },
      dataSource: { mode: 'platform', cache: { enabled: false } },
      clientCommands: [{ key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: labels[action.begin] }],
      actions: Object.entries(labels).map(([key, label]) => ({ key, label, actionType: 'invoke' })),
    }]
  }

  async getViewData(context: XpertResolvedViewHostContext, key: string) {
    return { items: await this.tickets.list(this.scope(context, key)) }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, key: string, actionKey: string,
    request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      const scope = this.scope(context, key)
      switch (actionKey) {
        case action.create:
          return { success: true, data: await this.tickets.create(scope, createTicket.parse(request.input)) }
        case action.begin:
          return { success: true, data: await this.tickets.begin(scope, reviseTicket.parse(request.input)) }
        case action.dispatchFailed:
          await this.tickets.fail(scope, reference.parse(request.input), 'dispatch_failed')
          return { success: true }
        case action.confirm:
          return { success: true, data: await this.tickets.confirm(scope, confirmTicket.parse(request.input)) }
        default:
          throw new TicketError('unavailable')
      }
    } catch (error) {
      if (error instanceof TicketError) return { success: false, data: { code: error.code } }
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      throw error
    }
  }

  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string,
    component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.scope(context, key)
    if (component.entry !== entryKey || component.isolation !== 'iframe') throw new TicketError('unavailable')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all(
      ['app.js', 'app.css', 'react.js', 'react-dom.js'].map((file) => readFile(new URL(file, remoteDir), 'utf8'))
    )
    return {
      contentType: 'text/html; charset=utf-8',
      html: renderRemoteReactIframeHtml({
        title: title.en_US, lang: context.locale ?? 'zh-Hans', appScript, appCss, reactUmd, reactDomUmd,
      }),
    }
  }

  private scope(context: XpertResolvedViewHostContext, key: string) {
    if (key !== viewKey) throw new TicketError('unavailable')
    return viewScope(context)
  }
}
