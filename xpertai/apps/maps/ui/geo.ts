import type { Coordinate } from '../src/lib/contracts'
type Point = { x: number; y: number }
export function project(coordinate: Coordinate, zoom: number): Point {
  const size = 256 * 2 ** zoom
  const sine = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, coordinate.lat)) * Math.PI / 180)
  return { x: (coordinate.lng + 180) / 360 * size, y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size }
}
export function unproject(point: Point, zoom: number): Coordinate {
  const size = 256 * 2 ** zoom
  return { lng: Math.max(-180, Math.min(180, point.x / size * 360 - 180)), lat: Math.max(-85, Math.min(85, Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y / size))) * 180 / Math.PI)) }
}
