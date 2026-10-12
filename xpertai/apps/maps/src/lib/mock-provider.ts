import {
  mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema, mapViewportInputSchema,
  mapPlacesResultSchema, mapPlaceResultSchema, mapRouteResultSchema, mapViewportResultSchema,
  type Coordinate, type MapProviderId, type MapPlace, type MapSearchInput, type MapDetailInput,
  type MapRouteInput, type MapViewportInput, type MapPlacesResult, type MapPlaceResult,
  type MapRouteResult, type MapViewportResult
} from './contracts.js'
import { MapProviderError, type MapProvider, type MapCredential } from './providers/types.js'

const center = { lng: 120.061, lat: 30.268 }
const fixtures: MapPlace[] = [
  { id: 'demo-1', name: '示例 · 河畔咖啡', location: { lng: 120.061, lat: 30.268 }, address: '杭州示意街区 1 号（虚构地点）', category: '模拟咖啡馆' },
  { id: 'demo-2', name: '示例 · 树下咖啡', location: { lng: 120.064, lat: 30.271 }, address: '杭州示意街区 2 号（虚构地点）', category: '模拟咖啡馆' },
  { id: 'demo-3', name: '示例 · 巷口咖啡', location: { lng: 120.057, lat: 30.266 }, address: '杭州示意街区 3 号（虚构地点）', category: '模拟咖啡馆' },
  { id: 'demo-4', name: '示例 · 花园咖啡', location: { lng: 120.062, lat: 30.263 }, address: '杭州示意街区 4 号（虚构地点）', category: '模拟咖啡馆' },
  { id: 'demo-5', name: '示例 · 湖畔咖啡', location: { lng: 120.055, lat: 30.270 }, address: '杭州示意街区 5 号（虚构地点）', category: '模拟咖啡馆' },
  { id: 'demo-6', name: '示例 · 转角咖啡', location: { lng: 120.066, lat: 30.265 }, address: '杭州示意街区 6 号（虚构地点）', category: '模拟咖啡馆' }
]
const attribution = '演示模式 · 合成示意底图与虚构地点 · 非真实地理数据 / DEMO'

/** Explicit opt-in fixtures, never used as a fallback for failed live requests. */
export class DemoMapProvider implements MapProvider {
  constructor(readonly id: MapProviderId = 'amap') {}
  async search(raw: MapSearchInput, _credential?: MapCredential, signal?: AbortSignal): Promise<MapPlacesResult> {
    cancelled(signal)
    const input = mapSearchInputSchema.parse(raw)
    const start = (input.page - 1) * input.pageSize
    const query = input.query.toLowerCase()
    const matches = /咖啡|coffee|cafe|茶/.test(query) ? fixtures : fixtures.filter(place => `${place.name} ${place.category}`.includes(query))
    return mapPlacesResultSchema.parse({ kind: 'places', provider: this.id, mode: 'demo', coordinateSystem: 'GCJ02',
      title: `固定杭州示例 · ${input.query}`.slice(0, 200), places: matches.slice(start, start + input.pageSize),
      page: input.page, hasMore: start + input.pageSize < matches.length, attribution })
  }
  async detail(raw: MapDetailInput, _credential?: MapCredential, signal?: AbortSignal): Promise<MapPlaceResult> {
    cancelled(signal)
    const input = mapDetailInputSchema.parse(raw)
    const place = fixtures.find((item) => item.id === input.id)
    if (!place) throw new MapProviderError('NO_RESULT', 'No demo place matches this ID.')
    return mapPlaceResultSchema.parse({ kind: 'place', provider: this.id, mode: 'demo', coordinateSystem: 'GCJ02', place, attribution })
  }
  async route(raw: MapRouteInput, _credential?: MapCredential, signal?: AbortSignal): Promise<MapRouteResult> {
    cancelled(signal)
    const input = mapRouteInputSchema.parse(raw)
    const middle = { lng: input.destination.lng, lat: input.origin.lat }
    return mapRouteResultSchema.parse({ kind: 'route', provider: this.id, mode: 'demo', coordinateSystem: 'GCJ02',
      ...input, title: '演示路线 · 非导航路线', distanceMeters: 1600, durationSeconds: input.travelMode === 'walking' ? 1200 : 300,
      path: [input.origin, middle, input.destination], steps: ['演示数据：路线、距离和时长均为模拟值，请勿用于导航。'], attribution })
  }
  async render(raw: MapViewportInput, _credential?: MapCredential, signal?: AbortSignal): Promise<MapViewportResult> {
    cancelled(signal)
    const input = mapViewportInputSchema.parse(raw)
    const origin = project(input.center, input.zoom)
    const base = project(center, input.zoom)
    const x = input.width / 2 + base.x - origin.x
    const y = input.height / 2 + base.y - origin.y
    const unit = Math.max(20, Math.min(320, 75 * 2 ** (input.zoom - 14)))
    const vertical = Array.from({ length: 30 }, (_, index) => {
      const px = ((x % unit) + unit) % unit + (index - 15) * unit + input.width / 2
      return `<path d="M${px.toFixed(2)} 0V${input.height}"/>`
    }).join('')
    const horizontal = Array.from({ length: 30 }, (_, index) => {
      const py = ((y % unit) + unit) % unit + (index - 15) * unit + input.height / 2
      return `<path d="M0 ${py.toFixed(2)}H${input.width}"/>`
    }).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="#edf1e9"/><g stroke="#fff" stroke-width="9">${vertical}${horizontal}</g><g stroke="#d5ded3" stroke-width="1">${vertical}${horizontal}</g><ellipse cx="${(x + unit).toFixed(2)}" cy="${(y - unit).toFixed(2)}" rx="${(unit * .7).toFixed(2)}" ry="${(unit * .45).toFixed(2)}" fill="#c9e5e8"/><rect x="${(x - unit * 1.5).toFixed(2)}" y="${(y + unit * .5).toFixed(2)}" width="${unit}" height="${unit * .7}" rx="15" fill="#cce0c2"/><text x="16" y="30" font-family="sans-serif" font-size="16" fill="#647164">DEMO · 合成示意底图</text><text x="16" y="${input.height - 16}" font-family="sans-serif" font-size="12" fill="#647164">虚构街区 / Synthetic map — not for navigation</text></svg>`
    return mapViewportResultSchema.parse({ kind: 'viewport', provider: this.id, mode: 'demo', coordinateSystem: 'GCJ02', ...input,
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, attribution })
  }
}
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MapProviderError('CANCELLED', 'Map request was cancelled.')
}
function project(point: Coordinate, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom
  const sine = Math.sin(point.lat * Math.PI / 180)
  return { x: (point.lng + 180) / 360 * scale, y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale }
}
