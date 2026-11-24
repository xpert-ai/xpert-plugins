import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v3'
import { ViewExtensionProvider, renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type {
  XpertResolvedViewHostContext,
  XpertExtensionViewManifest,
  XpertRemoteComponentViewSchema,
  XpertViewQuery,
  XpertViewActionRequest,
  XpertViewActionResult
} from '@xpert-ai/contracts'
import { ENTRY, FEATURE, ICON, PLUGIN_NAME, PROVIDER, text, TOOLS, VIEW } from './constants'
import { confirmationSchema, DomainError, inputSchema, requireScope } from './domain'
import { PaymentService } from './payment.service'

const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), requestKey: z.string().uuid(), input: inputSchema }).strict(),
  z.object({ kind: z.literal('start'), id: z.string().uuid(), revision: z.number().int().min(0) }).strict(),
  z
    .object({
      kind: z.literal('confirm'),
      id: z.string().uuid(),
      revision: z.number().int().min(0),
      result: confirmationSchema
    })
    .strict(),
  z.object({ kind: z.literal('cancel'), id: z.string().uuid(), attemptId: z.string().uuid() }).strict()
])
const scope = (ctx: XpertResolvedViewHostContext) =>
  requireScope({
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    assistantId: ctx.hostId
  })
@Injectable()
@ViewExtensionProvider(PROVIDER)
export class PaymentViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: PaymentService) {}
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }
  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== 'agent.workbench.main' && slot !== 'agent.workbench.fixed') return []
    return [
      {
        key: VIEW,
        title: text('Payment promises', '回款承诺'),
        description: text('Review commitments and confirm the next follow-up.', '核对付款承诺，确认下一次跟进。'),
        icon: ICON,
        hostType: 'agent',
        slot,
        order: 30,
        refreshable: true,
        activation: { requiredFeatures: [FEATURE] },
        source: { provider: PROVIDER, plugin: PLUGIN_NAME },
        ...(slot === 'agent.workbench.fixed'
          ? {
              workbench: {
                fixed: true,
                menu: { enabled: true, label: text('Payment promises', '回款承诺'), order: 30, icon: ICON }
              }
            }
          : {}),
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
            supportsPagination: true,
            supportsSearch: true,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: { enabled: false }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'payment-updated',
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [TOOLS[1], TOOLS[2]] },
              action: { type: 'forward', debounceMs: 200 }
            }
          ]
        },
        clientCommands: [{ key: 'assistant.context.set' }, { key: 'assistant.chat.send_message' }],
        actions: [
          {
            key: 'mutate',
            label: text('Update payment case', '更新跟进记录'),
            placement: 'toolbar',
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
  ) {
    if (viewKey !== VIEW || component.entry !== ENTRY) throw new DomainError('not_found')
    const [appScript, appCss] = await Promise.all([
      readFile(join(__dirname, '../remote/app.js'), 'utf8'),
      readFile(join(__dirname, '../remote/app.css'), 'utf8')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Payment Follow-up',
        lang: 'zh-Hans',
        reactUmd: '',
        reactDomUmd: '',
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8' as const
    }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    if (viewKey !== VIEW) throw new DomainError('not_found')
    const page = z
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(query.page ?? 1)
    const search = z
      .string()
      .max(100)
      .parse(query.search ?? '')
    const id = z.string().uuid().optional().parse(query.parameters?.recordId)
    // Reading may persist timeout recovery; list afterwards so both panels
    // describe the same committed status.
    const selected = id ? await this.service.read(scope(context), id) : null
    const listing = await this.service.list(scope(context), page, search)
    return { items: listing.items, total: listing.total, meta: { page, pageSize: 20, selected } }
  }
  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW || actionKey !== 'mutate') throw new DomainError('not_found')
      const action = actionSchema.parse(request.input)
      const identity = scope(context)
      const data =
        action.kind === 'create'
          ? await this.service.create(identity, action.input, action.requestKey)
          : action.kind === 'start'
            ? await this.service.start(identity, action.id, action.revision)
            : action.kind === 'confirm'
              ? await this.service.confirm(identity, action.id, action.revision, action.result)
              : await this.service.fail(identity, action.id, action.attemptId, 'user_cancelled')
      return { success: true, refresh: true, data }
    } catch (error) {
      const code =
        error instanceof DomainError ? error.code : error instanceof z.ZodError ? 'invalid_input' : 'operation_failed'
      return { success: false, data: { code } }
    }
  }
}
