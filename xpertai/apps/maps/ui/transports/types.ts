import type { MapDetailInput, MapPlace, MapPlaceResult, MapPlacesResult, MapResult, MapRouteInput, MapRouteResult, MapSearchInput, MapViewportInput, MapViewportResult } from '../../src/lib/contracts'
import type { McpUiHostStyles } from '@modelcontextprotocol/ext-apps'

export type MapsTheme = { scheme: 'light' | 'dark'; source?: 'workbench' | 'mcp'; density?: 'default' | 'compact'; tokens?: Record<string, string>; styles?: McpUiHostStyles }
export type MapsUiContext = { locale: string; theme: MapsTheme; canReference: boolean }
export type MapsService = Pick<MapResult, 'provider' | 'mode'>
export type MapsIncoming = { result: MapResult; search?: MapSearchInput }
export interface MapsTransport {
  readonly surface: 'mcp' | 'workbench'
  connect(callbacks: { onContext: (context: MapsUiContext) => void; onResult: (incoming: MapsIncoming) => void; onError: () => void; onService: (service: MapsService) => void; onReset: () => void }): Promise<void>
  search(input: MapSearchInput, signal: AbortSignal): Promise<MapPlacesResult>
  detail(input: MapDetailInput, signal: AbortSignal): Promise<MapPlaceResult>
  route(input: MapRouteInput, signal: AbortSignal): Promise<MapRouteResult>
  render(input: MapViewportInput, signal: AbortSignal): Promise<MapViewportResult>
  reference(place: MapPlace, result: MapResult): Promise<void>
  dispose(): void
}
export class MapsTransportError extends Error {
  constructor(readonly code: 'unavailable' | 'failed' | 'referenceUnavailable') { super(code); this.name = 'MapsTransportError' }
}
