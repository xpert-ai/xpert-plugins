import { App } from '@modelcontextprotocol/ext-apps'
import { mapResultSchema, mapSearchInputSchema, type MapDetailInput, type MapRouteInput, type MapSearchInput, type MapViewportInput } from '../../src/lib/contracts'
import { MapsTransportError, type MapsTransport } from './types'
export function createMcpTransport(): MapsTransport {
  const app = new App({ name: 'Xpert Maps', version: '0.2.0' }, {}, { autoResize: false })
  let search: MapSearchInput | undefined
  async function call(name: string, args: MapSearchInput | MapDetailInput | MapRouteInput | MapViewportInput, signal: AbortSignal) {
    const result = await app.callServerTool({ name, arguments: args }, { signal })
    if (result.isError) throw new MapsTransportError('failed')
    return mapResultSchema.parse(result.structuredContent)
  }
  return {
    surface: 'mcp',
    async connect(callbacks) {
      const context = () => {
        const host = app.getHostContext()
        // The SDK merges partial notifications before this callback; styles is a snapshot.
        callbacks.onContext({ locale: host?.locale ?? 'en-US', theme: { source: 'mcp', scheme: host?.theme ?? 'light', styles: host?.styles }, canReference: false })
      }
      app.ontoolinput = value => { const parsed = mapSearchInputSchema.safeParse(value.arguments); search = parsed.success ? parsed.data : undefined }
      app.ontoolresult = value => { const parsed = mapResultSchema.safeParse(value.structuredContent); if (parsed.success) { callbacks.onService({ provider: parsed.data.provider, mode: parsed.data.mode }); callbacks.onResult({ result: parsed.data, search }) } else callbacks.onError() }
      app.onhostcontextchanged = context
      await app.connect(); context()
      await app.sendSizeChanged({ height: 720 })
    },
    async search(input, signal) { const result = await call('maps_search_view', input, signal); if (result.kind !== 'places') throw new MapsTransportError('failed'); return result },
    async detail(input, signal) { const result = await call('maps_detail_view', input, signal); if (result.kind !== 'place') throw new MapsTransportError('failed'); return result },
    async route(input, signal) { const result = await call('maps_route_view', input, signal); if (result.kind !== 'route') throw new MapsTransportError('failed'); return result },
    async render(input, signal) { const result = await call('maps_render', input, signal); if (result.kind !== 'viewport') throw new MapsTransportError('failed'); return result },
    async reference() { throw new MapsTransportError('referenceUnavailable') },
    dispose() { void app.close() }
  }
}
