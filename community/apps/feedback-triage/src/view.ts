import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  XpertExtensionViewManifest,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
} from '@xpert-ai/contracts'
import {
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  type IXpertViewExtensionProvider,
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ANALYZE_TOOL, FEATURE, ICON, PLUGIN_NAME, title, VIEW_KEY, VIEW_PROVIDER } from './constants.js'
import { confirmTicketSchema, createTicketSchema, requireScope, TicketError, ticketIdSchema } from './domain.js'
import { PAGE_SIZE, TicketService } from './service.js'

const ENTRY = 'feedback-workbench'
const actions = [
  { key: 'create_ticket', label: { en_US: 'Save feedback', zh_Hans: '保存反馈' } },
  { key: 'analyze_ticket', label: { en_US: 'Analyze feedback', zh_Hans: '分析反馈' } },
  { key: 'confirm_ticket', label: { en_US: 'Confirm triage', zh_Hans: '确认分诊' } },
]
const requirePackage = createRequire(import.meta.url)
function reactRuntime(name: 'react' | 'react-dom') {
  const packageDir = dirname(requirePackage.resolve(name + '/package.json'))
  return readFile(join(packageDir, 'umd', name + '.production.min.js'), 'utf8')
}
function viewScope(context: XpertResolvedViewHostContext, key: string) {
  if (key !== VIEW_KEY || context.hostType !== 'agent') throw new TicketError('not_found')
  return requireScope(context)
}

function businessFailure(code: TicketError['code']) {
  return { success: false, failure: { kind: 'business' as const, code }, data: { code } }
}

@Injectable()
@ViewExtensionProvider(VIEW_PROVIDER)
export class FeedbackView implements IXpertViewExtensionProvider {
  constructor(private readonly service: TicketService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [
      {
        key: VIEW_KEY,
        title,
        hostType: 'agent',
        slot,
        icon: ICON,
        order: 10,
        refreshable: true,
        source: { provider: VIEW_PROVIDER, plugin: PLUGIN_NAME },
        activation: { requiredFeatures: [FEATURE] },
        ...(slot === 'agent.workbench.fixed'
          ? { workbench: { fixed: true, menu: { enabled: true, label: title, icon: ICON } } }
          : {}),
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: ENTRY },
          dataSource: { mode: 'platform' },
        },
        dataSource: {
          mode: 'platform',
          querySchema: { supportsPagination: true, defaultPageSize: PAGE_SIZE },
          cache: { enabled: false },
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'feedback-analyzed',
              event: 'assistant.tool.completed',
              filter: { toolNames: [ANALYZE_TOOL] },
              action: { type: 'forward', debounceMs: 350 },
            },
          ],
        },
        actions: actions.map((action) => ({ ...action, actionType: 'invoke' })),
      },
    ]
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    key: string,
    component: XpertRemoteComponentViewSchema['component'],
  ) {
    viewScope(context, key)
    if (component.entry !== ENTRY || component.isolation !== 'iframe') throw new TicketError('not_found')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(new URL('./remote/workbench.js', import.meta.url), 'utf8'),
      readFile(new URL('./remote/workbench.css', import.meta.url), 'utf8'),
      reactRuntime('react'),
      reactRuntime('react-dom'),
    ])
    return {
      contentType: 'text/html; charset=utf-8' as const,
      html: renderRemoteReactIframeHtml({
        title: 'Feedback triage',
        lang: context.locale ?? 'en',
        appScript,
        appCss,
        reactUmd,
        reactDomUmd,
      }),
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    key: string,
    query: XpertViewQuery,
  ): Promise<XpertViewDataResult> {
    const page = z.number().int().min(1).max(10000).optional().parse(query.page) ?? 1
    return { item: await this.service.list(viewScope(context, key), page) }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    key: string,
    action: string,
    request: XpertViewActionRequest,
  ): Promise<XpertViewActionResult> {
    try {
      const scope = viewScope(context, key)
      switch (action) {
        case 'create_ticket':
          return {
            success: true,
            data: { ticket: await this.service.create(scope, createTicketSchema.parse(request.input)) },
          }
        case 'analyze_ticket':
          return {
            success: true,
            data: { ticket: await this.service.analyze(scope, ticketIdSchema.parse(request.input).id) },
          }
        case 'confirm_ticket': {
          const { id, category } = confirmTicketSchema.parse(request.input)
          return { success: true, data: { ticket: await this.service.confirm(scope, id, category) } }
        }
        default:
          throw new TicketError('not_found')
      }
    } catch (error) {
      if (error instanceof z.ZodError) return businessFailure('invalid_input')
      if (error instanceof TicketError) return businessFailure(error.code)
      throw error
    }
  }
}
