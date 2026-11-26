import { Inject, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import {
  AGENT_WORKBENCH_SLOT, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  type XpertExtensionViewManifest, type XpertResolvedViewHostContext,
  type XpertViewActionRequest, type XpertViewActionResult, type XpertViewQuery
} from '@xpert-ai/contracts'
import {
  renderRemoteModuleIframeHtml, ViewExtensionProvider, type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { draftTool, featureKey, labels, providerKey, requireScope, TicketError, viewKey } from './domain.js'
import { TicketService } from './ticket.service.js'

export const manifest: XpertExtensionViewManifest = {
  key: viewKey,
  title: labels.title,
  hostType: 'agent',
  slot: AGENT_WORKBENCH_SLOT,
  activation: { requiredFeatures: [featureKey] },
  source: { provider: providerKey },
  workbench: { openMode: 'on-demand', menu: { enabled: true } },
  refreshable: true,
  dataSource: {
    mode: 'platform',
    cache: { enabled: false },
    querySchema: { supportsPagination: true, supportsSelection: true, defaultPageSize: 15 }
  },
  view: {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: { isolation: 'iframe', entry: viewKey },
    dataSource: { mode: 'platform' }
  },
  actions: [
    { key: 'create', label: { en_US: 'Create ticket', zh_Hans: '录入工单' }, actionType: 'invoke' },
    { key: 'review', label: { en_US: 'Confirm review', zh_Hans: '确认审核' }, actionType: 'invoke' }
  ],
  clientCommands: [{ key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND }],
  hostEvents: {
    subscriptions: [{
      key: 'triage-draft-saved',
      event: 'assistant.tool.completed',
      filter: { sources: ['chatkit'], toolNames: [draftTool] },
      action: { type: 'forward' }
    }]
  }
}

@Injectable()
@ViewExtensionProvider(providerKey)
export class TriageWorkbench implements IXpertViewExtensionProvider {
  constructor(@Inject(TicketService) private readonly tickets: TicketService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent' && !!context.organizationId && !!context.userId
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string) {
    return this.supports(context) && slot === AGENT_WORKBENCH_SLOT ? [manifest] : []
  }

  private scope(context: XpertResolvedViewHostContext, key: string) {
    if (!this.supports(context) || key !== viewKey ||
        !context.capabilities?.features?.includes(featureKey)) throw new TicketError('scope_required')
    return requireScope(context.tenantId, context.organizationId, context.userId)
  }

  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    const scope = this.scope(context, key)
    if (query.selectionId) return { item: await this.tickets.get(scope, query.selectionId) }
    const { items, total, page, pageSize } = await this.tickets.list(scope, query.page)
    return { items, total, meta: { page, pageSize } }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      const scope = this.scope(context, key)
      if (action === 'create') return { success: true, data: await this.tickets.create(scope, request.input) }
      if (action === 'review') return { success: true, data: await this.tickets.review(scope, request.input) }
      throw new TicketError('invalid_input')
    } catch (error) {
      if (error instanceof TicketError) return { success: false, failure: { kind: 'business', code: error.code } }
      throw error
    }
  }

  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string) {
    this.scope(context, key)
    const fromDist = (asset: string) => readFile(new URL(`./remote/${asset}`, import.meta.url), 'utf8')
    const [appScript, appCss] = await Promise.all([fromDist('app.js'), fromDist('app.css')])
    return {
      html: renderRemoteModuleIframeHtml({ title: labels.title.en_US, appScript, appCss }),
      contentType: 'text/html; charset=utf-8' as const
    }
  }
}
