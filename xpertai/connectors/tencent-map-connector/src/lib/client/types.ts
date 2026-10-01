export type TencentMapCoordinate = {
  lat: number
  lng: number
}

export type TencentMapWebServicePayload = Record<string, unknown>

export type TencentMapRuntimeCredential = {
  apiKey: string
}

export type TencentMapOperation =
  | 'geocoder'
  | 'reverseGeocoder'
  | 'placeSuggestion'
  | 'placeSearchNearby'
  | 'placeDetail'
  | 'directionDriving'
  | 'directionTransit'
  | 'directionWalking'
  | 'directionBicycling'
  | 'matrix'
  | 'weather'
  | 'ipLocation'
  | 'placeAlongby'
  | 'futureDrivingDirection'
  | 'waypointOrder'

export type TencentMapCallInput = {
  apiKey: string
  name: TencentMapOperation
  arguments: Record<string, unknown>
  timeoutMs?: number
}
