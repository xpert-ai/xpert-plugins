import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  XpertExtensionViewManifest,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, VIEW_KEY } from './constants.js'
import { RoadEventCommandCenterDraftService } from './road-event-command-center-draft.service.js'
import { saveDraftReceiptSchema, saveDraftSchema } from './domain/draft.js'
import type { DraftScope } from './road-event-command-center-draft.service.js'

function escapeInline(value: string, tag: 'script' | 'style') {
  return value.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag)
}

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class RoadEventCommandCenterViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly drafts: RoadEventCommandCenterDraftService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    const fixed = slot === 'agent.workbench.fixed'
    return [{
      key: VIEW_KEY,
      title: { en_US: 'Road Event Command Center', zh_Hans: '道路事件智能指挥中心' },
      description: { en_US: 'Review and confirm AI-assisted road event response plans.', zh_Hans: '审阅并确认 AI 辅助生成的道路事件处置建议。' },
      icon: { type: 'font', value: 'ri-road-map-line' },
      hostType: 'agent',
      slot,
      order: 25,
      refreshable: true,
      activation: { requiredFeatures: [FEATURE] },
      ...(fixed ? { workbench: { fixed: true, menu: { enabled: true, label: { en_US: 'Road Events', zh_Hans: '道路事件' }, order: 25 } } } : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: {
        type: 'remote_component',
        runtime: 'esm',
        protocolVersion: 1,
        component: { isolation: 'iframe', entry: REMOTE_ENTRY },
        dataSource: { mode: 'platform' }
      },
      dataSource: {
        mode: 'platform',
        querySchema: { supportsParameters: false },
        cache: { enabled: false }
      },
      actions: [{
        key: 'save_draft',
        label: { en_US: 'Save draft', zh_Hans: '保存草稿' },
        actionType: 'invoke'
      }]
    }]
  }

  private scope(context: XpertResolvedViewHostContext, viewKey: string): DraftScope {
    if (viewKey !== VIEW_KEY || context.hostType !== 'agent') throw new Error('not_found')
    return {
      tenantId: context.tenantId,
      organizationId: context.organizationId ?? '',
      workspaceId: context.workspaceId ?? '',
      userId: context.userId,
      xpertId: context.hostId
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (query.parameters && Object.keys(query.parameters).length) throw new Error('not_found')
    return { item: await this.drafts.get(this.scope(context, viewKey)) }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    const scope = this.scope(context, viewKey)
    try {
      if (actionKey !== 'save_draft') throw new Error('not_found')
      const input = saveDraftSchema.parse(request.input)
      return { success: true, data: saveDraftReceiptSchema.parse(await this.drafts.save(scope, input)) }
    } catch (error) {
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      if (error instanceof Error && error.message === 'conflict') return { success: false, data: { code: 'conflict' } }
      throw error
    }
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== VIEW_KEY || component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') {
      throw new Error('remote_component_not_found')
    }
    const remoteDir = resolve(__dirname, '../../dist/remote')
    const appScript = await readFile(resolve(remoteDir, 'app.js'), 'utf8')
    const appCss = await readFile(resolve(remoteDir, 'app.css'), 'utf8')
    const html = [
      '<!doctype html>',
      '<html lang="zh-Hans">',
      '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>道路事件智能指挥中心</title><style>',
      escapeInline(appCss, 'style'),
      '</style></head><body><div id="app"></div><script type="module">',
      escapeInline(appScript, 'script'),
      '</script></body></html>'
    ].join('')
    return { html, contentType: 'text/html; charset=utf-8' }
  }
}
