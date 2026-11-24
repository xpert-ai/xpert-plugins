import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import type {
  XpertExtensionViewManifest, XpertRemoteComponentEntry, XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult,
  XpertViewDataResult, XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  confirmTriageSchema, rejectTriageSchema, resetTicketSchema, seedSchema, TicketTriageError
} from './domain/contracts.js'
import { ACTION_KEYS, FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, VIEW_KEY } from './constants.js'
import { scopeFromView } from './scope.js'
import { TicketTriageService } from './ticket.service.js'

const acted = (context: XpertResolvedViewHostContext, actionKey: string, input: unknown) => {
  switch (actionKey) {
    case 'seed_tickets': return { schema: seedSchema, run: (service: TicketTriageService) => service.seedDemoTickets(scopeFromView(context)) }
    case 'confirm_triage': return { schema: confirmTriageSchema, run: (service: TicketTriageService) => service.confirmTriage(scopeFromView(context), confirmTriageSchema.parse(input)) }
    case 'reject_triage': return { schema: rejectTriageSchema, run: (service: TicketTriageService) => service.rejectTriage(scopeFromView(context), rejectTriageSchema.parse(input)) }
    case 'reset_ticket': return { schema: resetTicketSchema, run: (service: TicketTriageService) => service.resetTicket(scopeFromView(context), resetTicketSchema.parse(input)) }
    default: return null
  }
}

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class TicketBoardViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TicketTriageService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent') return []
    if (slot !== 'agent.workbench.main' && slot !== 'agent.workbench.fixed') return []
    const manifest = {
      key: VIEW_KEY,
      title: { en_US: 'Ticket triage board', zh_Hans: '工单分诊板' },
      description: {
        en_US: 'Review AI triage proposals and confirm, reject, or retry them.',
        zh_Hans: '查看 AI 分诊建议，确认、退回或重试。'
      },
      icon: { type: 'font', value: 'ri-customer-service-2-line' },
      hostType: 'agent',
      slot,
      order: 30,
      refreshable: false,
      activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed'
        ? { workbench: { fixed: true, menu: { enabled: true, label: { en_US: 'Ticket triage', zh_Hans: '工单分诊' }, order: 30 } } }
        : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: {
        type: 'remote_component', runtime: 'esm', protocolVersion: 1,
        component: { isolation: 'iframe', entry: REMOTE_ENTRY },
        dataSource: { mode: 'platform' }
      },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      actions: ACTION_KEYS.map(key => ({
        key,
        label: {
          en_US: key === 'seed_tickets' ? 'Load demo tickets'
            : key === 'confirm_triage' ? 'Confirm'
              : key === 'reject_triage' ? 'Reject' : 'Retry',
          zh_Hans: key === 'seed_tickets' ? '载入演示工单'
            : key === 'confirm_triage' ? '确认'
              : key === 'reject_triage' ? '退回' : '重试'
        },
        actionType: 'invoke',
        placement: 'toolbar'
      }))
    }
    return [manifest as unknown as XpertExtensionViewManifest]
  }

  async getViewData(context: XpertResolvedViewHostContext, _viewKey: string, _query: XpertViewQuery): Promise<XpertViewDataResult> {
    return { item: await this.service.board(scopeFromView(context)) } as unknown as XpertViewDataResult
  }

  async executeViewAction(context: XpertResolvedViewHostContext, _viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    const action = acted(context, actionKey, (request as { input?: unknown }).input ?? {})
    if (!action) return { success: false, data: { code: 'invalid_input' } } as XpertViewActionResult
    try {
      const data = await action.run(this.service)
      return { success: true, data } as XpertViewActionResult
    } catch (error) {
      if (error instanceof TicketTriageError) return { success: false, data: { code: error.code, ticketCode: error.ticketCode } } as XpertViewActionResult
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } } as XpertViewActionResult
      throw error
    }
  }

  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, _viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    const entry = (component as { entry?: string }).entry
    if (entry !== REMOTE_ENTRY || (component as { isolation?: string }).isolation !== 'iframe') {
      throw new Error('unsupported_remote_component')
    }
    return {
      html: await readFile(new URL('../remote/ticket-triage.html', import.meta.url), 'utf8'),
      contentType: 'text/html; charset=utf-8'
    }
  }
}
