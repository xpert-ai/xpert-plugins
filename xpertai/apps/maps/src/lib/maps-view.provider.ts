import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import {
  AGENT_WORKBENCH_SLOT, ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND,
  type I18nObject, type XpertExtensionViewManifest, type XpertRemoteComponentEntry,
  type XpertRemoteComponentViewSchema, type XpertResolvedViewHostContext,
  type XpertViewActionRequest, type XpertViewActionResult, type XpertViewDataResult, type XpertViewQuery
} from '@xpert-ai/contracts'
import {
  ViewExtensionProvider, ViewMiddlewareRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  renderRemoteReactIframeHtml, type IXpertViewExtensionProvider, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { MAPS_ICON, MAPS_MIDDLEWARE, MAPS_REMOTE_ENTRY, MAPS_VIEW_KEY, MAPS_VIEW_PROVIDER } from './constants.js'
import { mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema, mapViewportInputSchema, type MapResult } from './contracts.js'
import { createMapsSession } from './maps-session.js'
import { mapsOptionsSchema } from './options.js'
import { MapProviderError, type MapErrorCode } from './providers/types.js'
import { mapViewQuerySchema, type MapViewData } from './view-contracts.js'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(MAPS_VIEW_PROVIDER)
export class MapsViewProvider implements IXpertViewExtensionProvider {
  constructor(@Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry) {}

  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || slot !== AGENT_WORKBENCH_SLOT) return []
    return [{
      key: MAPS_VIEW_KEY, title: text('Maps', '地图'), icon: MAPS_ICON,
      description: text('Explore places and routes alongside your conversation.', '在对话旁探索地点和路线。'),
      hostType: 'agent', slot, order: 40, refreshable: true,
      source: { provider: MAPS_VIEW_PROVIDER, plugin: '@xpert-ai/plugin-maps' },
      activation: { requiredFeatures: [MAPS_MIDDLEWARE] },
      workbench: { openMode: 'auto', contextScope: 'conversation', menu: { enabled: true, label: text('Maps', '地图'), icon: MAPS_ICON } },
      view: {
        type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: MAPS_REMOTE_ENTRY }, dataSource: { mode: 'platform' }
      },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      actions: [
        { key: 'maps.search', label: text('Search places', '搜索地点'), actionType: 'invoke' },
        { key: 'maps.detail', label: text('Place details', '地点详情'), actionType: 'invoke' },
        { key: 'maps.route', label: text('Plan route', '规划路线'), actionType: 'invoke' },
        { key: 'maps.render', label: text('Render map', '查看地图'), actionType: 'invoke' }
      ],
      clientCommands: [{ key: ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND, label: text('Reference in conversation', '引用到对话') }],
      hostEvents: { subscriptions: [{
        key: 'maps-tool-completed', event: 'assistant.tool.completed',
        filter: { sources: ['chatkit'], toolNames: ['maps_search', 'maps_detail', 'maps_route'] },
        action: { type: 'forward' }
      }] }
    }]
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult<MapViewData>> {
    const session = await this.session(context, viewKey)
    const parameters = mapViewQuerySchema.parse(query.parameters ?? {})
    const item: MapViewData = { kind: 'maps-view', provider: session.settings.provider, mode: session.settings.mode }
    if (parameters.operation && parameters.inputJson) {
      const input: unknown = JSON.parse(parameters.inputJson)
      item.result = await execute(session, `maps.${parameters.operation}`, input)
      if (parameters.operation === 'search') item.search = mapSearchInputSchema.parse(input)
    }
    return { item }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult<MapResult | { code: MapErrorCode }>> {
    // Resolve authorization even for malformed or unknown operations. Never trust browser provider/mode/scope.
    const session = await this.session(context, viewKey)
    try {
      return { success: true, data: await execute(session, actionKey, request.input) }
    } catch (error) {
      const code = error instanceof MapProviderError ? error.code : error instanceof z.ZodError ? 'INVALID_ARGUMENT' : 'REQUEST_FAILED'
      return { success: false, data: { code } }
    }
  }

  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    await this.session(context, viewKey)
    if (component.entry !== MAPS_REMOTE_ENTRY || component.isolation !== 'iframe') throw new NotFoundException('Unknown maps component')
    const root = new URL(`./remote-components/${MAPS_REMOTE_ENTRY}/`, import.meta.url)
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all(
      ['app.js', 'app.css', 'react.production.min.js', 'react-dom.production.min.js'].map(file => readFile(new URL(file, root), 'utf8'))
    )
    return {
      html: renderRemoteReactIframeHtml({ title: 'Maps', lang: context.locale?.startsWith('zh') ? 'zh-CN' : 'en', appScript, appCss, reactUmd, reactDomUmd }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  private async session(context: XpertResolvedViewHostContext, viewKey: string) {
    if (!this.supports(context) || viewKey !== MAPS_VIEW_KEY) throw new NotFoundException('Unknown maps view')
    const resolver = this.capabilities?.get(ViewMiddlewareRuntimeCapability)
    if (!resolver) throw new MapProviderError('HOST_RUNTIME_UNAVAILABLE', 'MAPS_HOST_RUNTIME_UNAVAILABLE')
    const trusted = await resolver.resolve({ context, provider: MAPS_MIDDLEWARE, requiredFeature: MAPS_MIDDLEWARE })
    return createMapsSession(mapsOptionsSchema.parse(trusted.options ?? {}), trusted.context)
  }
}

function execute(session: ReturnType<typeof createMapsSession>, action: string, input: unknown): Promise<MapResult> {
  switch (action) {
    case 'maps.search': return session.search(mapSearchInputSchema.parse(input))
    case 'maps.detail': return session.detail(mapDetailInputSchema.parse(input))
    case 'maps.route': return session.route(mapRouteInputSchema.parse(input))
    case 'maps.render': return session.render(mapViewportInputSchema.parse(input))
    default: throw new MapProviderError('INVALID_ARGUMENT', 'Unknown maps action')
  }
}
