import { ConnectorRuntimeCapability, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { MapSearchInput, MapDetailInput, MapRouteInput, MapViewportInput } from './contracts.js'
import { mapsOptionsSchema, type MapsOptions } from './options.js'
import { AmapMapProvider, TencentMapProvider } from './providers/index.js'
import { MapProviderError, type MapCredential } from './providers/types.js'
import { DemoMapProvider } from './mock-provider.js'

/** Credentials are resolved on each call from the host-authorized Assistant scope. */
export function createMapsSession(options: MapsOptions, context: IAgentMiddlewareContext) {
  const settings = mapsOptionsSchema.parse(options)
  const provider = settings.mode === 'demo'
    ? new DemoMapProvider(settings.provider)
    : settings.provider === 'amap' ? new AmapMapProvider() : new TencentMapProvider()

  async function credential(): Promise<MapCredential> {
    if (settings.mode === 'demo') return { apiKey: 'demo-not-a-credential' }
    if (!context.tenantId || !context.organizationId || !context.userId || !context.workspaceId) {
      throw new MapProviderError('SCOPE_REQUIRED', 'MAPS_SCOPE_REQUIRED')
    }
    const runtime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability)
    if (!runtime?.getConnectorCredential) throw new MapProviderError('CONNECTOR_REQUIRED', 'MAPS_CONNECTOR_REQUIRED')
    const result = await runtime.getConnectorCredential({
      workspaceId: context.workspaceId,
      provider: settings.provider === 'amap' ? 'amap' : 'tencent-map',
      ...(settings.connectorId ? { connectorId: settings.connectorId } : {})
    })
    const { apiKey, privateKey } = result.credentials
    if (typeof apiKey !== 'string' || !apiKey.trim() ||
      (privateKey !== undefined && typeof privateKey !== 'string')) {
      throw new MapProviderError('CREDENTIAL_INVALID', 'MAPS_CREDENTIAL_INVALID')
    }
    return { apiKey, ...(privateKey ? { privateKey } : {}) }
  }

  return {
    settings,
    async search(input: MapSearchInput, signal?: AbortSignal) {
      return provider.search(input, await credential(), signal)
    },
    async detail(input: MapDetailInput, signal?: AbortSignal) {
      return provider.detail(input, await credential(), signal)
    },
    async route(input: MapRouteInput, signal?: AbortSignal) {
      return provider.route(input, await credential(), signal)
    },
    async render(input: MapViewportInput, signal?: AbortSignal) {
      return provider.render(input, await credential(), signal)
    }
  }
}
