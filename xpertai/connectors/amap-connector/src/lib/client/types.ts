export type AmapCoordinate = {
  lng: number
  lat: number
}

export type AmapWebServicePayload = Record<string, unknown>

export type AmapRuntimeCredential = {
  apiKey: string
  privateKey?: string
}

export type AmapOperation =
  | 'geocode'
  | 'reverseGeocode'
  | 'placeText'
  | 'placeAround'
  | 'placeDetail'
  | 'directionDriving'
  | 'directionTransit'
  | 'directionWalking'
  | 'directionBicycling'
  | 'distance'
  | 'weather'
  | 'ipLocation'

export type AmapCallInput = AmapRuntimeCredential & {
  name: AmapOperation
  arguments: Record<string, unknown>
  timeoutMs?: number
  maxAttempts?: number
}
