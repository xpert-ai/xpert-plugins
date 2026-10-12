import type {
  MapProviderId, MapSearchInput, MapDetailInput, MapRouteInput, MapViewportInput,
  MapPlacesResult, MapPlaceResult, MapRouteResult, MapViewportResult
} from '../contracts.js'

export interface MapCredential { apiKey: string; privateKey?: string }
export interface MapProvider {
  readonly id: MapProviderId
  search(input: MapSearchInput, credential: MapCredential, signal?: AbortSignal): Promise<MapPlacesResult>
  detail(input: MapDetailInput, credential: MapCredential, signal?: AbortSignal): Promise<MapPlaceResult>
  route(input: MapRouteInput, credential: MapCredential, signal?: AbortSignal): Promise<MapRouteResult>
  render(input: MapViewportInput, credential: MapCredential, signal?: AbortSignal): Promise<MapViewportResult>
}
export type MapErrorCode = 'INVALID_ARGUMENT' | 'CREDENTIAL_INVALID' | 'REQUEST_FAILED' | 'QUOTA_EXCEEDED' | 'TIMEOUT' | 'CANCELLED' | 'RESPONSE_INVALID' | 'RESPONSE_TOO_LARGE' | 'NO_RESULT' | 'REGION_UNSUPPORTED' | 'SCOPE_REQUIRED' | 'CONNECTOR_REQUIRED' | 'HOST_RUNTIME_UNAVAILABLE'
export class MapProviderError extends Error {
  constructor(readonly code: MapErrorCode, message: string) { super(message); this.name = 'MapProviderError' }
}
export interface MapHttpOptions { fetch?: typeof globalThis.fetch; timeoutMs?: number }
export const attributionFor = (id: MapProviderId): string => id === 'amap' ? '© 高德地图 · GCJ-02' : '© 腾讯地图 · GCJ-02'
