import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewQuery, XpertViewActionRequest, XpertViewActionResult, XpertRemoteComponentViewSchema, XpertRemoteComponentEntry } from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { MeetingRecordService } from './meeting-record.service.js'
import { AnalysisBackgroundService } from './analysis-background.service.js'
import { createSchema, retrySchema, saveSchema } from './schemas.js'
import { fail, DomainError, type Scope } from './types.js'
import { PLUGIN_NAME, FEATURE, VIEW_PROVIDER, VIEW_KEY, REMOTE_ENTRY } from './constants.js'

function scope(context: XpertResolvedViewHostContext): Scope {
  if (!context.organizationId || !context.assistant?.instanceId) fail('ASSISTANT_NOT_READY')
  return { tenantId: context.tenantId, organizationId: context.organizationId, ownerUserId: context.userId, assistantId: context.assistant.instanceId }
}
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
@Injectable()
@ViewExtensionProvider(VIEW_PROVIDER)
export class MeetingViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly records: MeetingRecordService, private readonly background: AnalysisBackgroundService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== 'agent.workbench.fixed') return []
    return [{ key: VIEW_KEY, title: text('Meeting actions', '会后行动项核对'), hostType: 'agent', slot, order: 20,
      source: { provider: VIEW_PROVIDER, plugin: PLUGIN_NAME }, activation: { requiredFeatures: [FEATURE] },
      workbench: { fixed: true, menu: { enabled: true, label: text('Meeting actions', '行动项核对'), order: 20 } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: REMOTE_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true, supportsCursor: true, supportsPagination: true, defaultPageSize: 20 } },
      clientCommands: [{ key: WORKBENCH_NAVIGATION_OPEN_COMMAND, label: text('Open record or analysis conversation', '打开记录或分析会话') }],
      actions: ['create_analysis','retry_analysis','save_draft','confirm'].map(key => ({ key, actionType: 'invoke', label: text(key, key) }))
    }]
  }
  assertView(viewKey: string) { if (viewKey !== VIEW_KEY) fail('NOT_FOUND') }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    this.assertView(viewKey)
    const actor = scope(context)
    const mode = z.enum(['entry','list','detail','new']).parse(query.parameters?.mode ?? 'entry')
    if (mode === 'list') return this.records.list(actor, query.cursor ? z.string().uuid().parse(query.cursor) : undefined,
      z.number().int().min(1).parse(query.page ?? 1), z.number().int().min(1).max(100).parse(query.pageSize ?? 20))
    if (mode === 'new') return { meta: { page: 'new' } }
    if (query.selectionId) return { item: await this.records.detail(actor, z.string().uuid().parse(query.selectionId)) }
    if (mode === 'detail') fail('NOT_FOUND')
    const rows = await this.records.list(actor)
    return rows.items[0] ? { item: await this.records.detail(actor, rows.items[0].id) } : { meta: { page: 'new' } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    this.assertView(viewKey)
    const actor = scope(context)
    try {
      if (actionKey === 'create_analysis') {
        const input = createSchema.parse(request.input)
        const existing = await this.records.existingCreate(actor, input)
        if (existing) return { success: true, refresh: true, data: await this.records.dto(existing) }
        await this.background.preflight(actor)
        const record = await this.records.create(actor, input)
        await this.background.schedule(record)
        return { success: true, refresh: true, data: await this.records.dto(record) }
      }
      const input = actionKey === 'retry_analysis' ? retrySchema.parse(request.input) : saveSchema.parse(request.input)
      if (request.targetId && request.targetId !== input.meetingId) fail('VALIDATION_FAILED')
      if (actionKey === 'retry_analysis') {
        const existing = await this.records.existingRetry(actor, input)
        if (existing) return { success: true, refresh: true, data: await this.records.dto(existing) }
        await this.background.preflight(actor)
        const record = await this.records.retry(actor, input)
        await this.background.schedule(record)
        return { success: true, refresh: true, data: await this.records.dto(record) }
      }
      if (actionKey === 'save_draft' || actionKey === 'confirm') {
        const record = await this.records.save(actor, saveSchema.parse(request.input), actionKey === 'confirm')
        return { success: true, refresh: true, data: await this.records.dto(record) }
      }
      fail('INVALID_ACTION')
    } catch (error) {
      if (error instanceof DomainError || error instanceof z.ZodError) return { success: false, data: { code: error instanceof DomainError ? error.code : 'VALIDATION_FAILED' } }
      // Unknown infrastructure errors stay transport errors: their commit outcome may be uncertain.
      throw error
    }
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.assertView(viewKey); scope(context)
    if (component.entry !== REMOTE_ENTRY) fail('NOT_FOUND')
    const script = await readFile(new URL('../remote/app.js', import.meta.url), 'utf8')
    const css = await readFile(new URL('../remote/app.css', import.meta.url), 'utf8')
    return { contentType: 'text/html; charset=utf-8', html: renderRemoteReactIframeHtml({
      title: 'Meeting actions', lang: context.locale ?? 'zh-Hans', reactUmd: '', reactDomUmd: '', appScript: script,
      appCss: css
    }) }
  }
}
