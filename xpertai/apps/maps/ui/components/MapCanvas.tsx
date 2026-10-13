import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@xpert-ai/plugin-shadcn-ui'
import { LocateFixed, MapPin, Minus, Plus, RefreshCw } from 'lucide-react'
import type { Coordinate, MapPlace, MapResult, MapRouteResult, MapViewportResult } from '../../src/lib/contracts'
import type { MapsTransport } from '../transports/types'
import { useMapsI18n } from '../i18n'
import { project, unproject } from '../geo'
import { ActionButton } from './controls'

type Camera = { center: Coordinate; zoom: number }
type Size = { width: number; height: number }
export type MapCanvasHandle = { center: () => Coordinate }
type Props = { transport: MapsTransport; result?: MapResult; places: MapPlace[]; selected?: MapPlace; route?: MapRouteResult; fitRevision: number; onSelect: (place: MapPlace) => void; onAreaSearch: (center: Coordinate) => void }
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ transport, result, places, selected, route, fitRevision, onSelect, onAreaSearch }, ref) {
  const { t } = useMapsI18n()
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 640, height: 320 })
  const [camera, setCamera] = useState<Camera>({ center: { lng: 120.063, lat: 30.264 }, zoom: 13 })
  const [image, setImage] = useState<MapViewportResult>()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [retry, setRetry] = useState(0), [areaChanged, setAreaChanged] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; center: Coordinate; moved: boolean }>()
  const [dragging, setDragging] = useState(false)
  const currentCamera = useRef(camera); currentCamera.current = camera
  const fitValue = useRef(0)
  useImperativeHandle(ref, () => ({ center: () => currentCamera.current.center }), [])
  useLayoutEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const requestSize = useMemo(() => {
    const scale = Math.min(1, 1024 / Math.max(50, size.width), 1024 / Math.max(50, size.height))
    return { width: Math.max(50, Math.round(size.width * scale)), height: Math.max(50, Math.round(size.height * scale)) }
  }, [size])
  const fit = useCallback(() => {
    const coordinates = route?.path ?? places.map(place => place.location)
    if (!coordinates.length) return
    const points = coordinates.map(coordinate => project(coordinate, 0))
    const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x))
    const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y))
    const zoom = Math.floor(Math.log2(Math.min(Math.max(80, requestSize.width - 150) / Math.max(maxX - minX, 0.001), Math.max(80, requestSize.height - 125) / Math.max(maxY - minY, 0.001))))
    setCamera({ center: unproject({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, 0), zoom: Math.max(4, Math.min(coordinates.length === 1 ? 15 : 17, zoom)) })
    setAreaChanged(false)
  }, [places, route, requestSize])
  useEffect(() => { if (fitRevision !== fitValue.current && size.width > 0) { fitValue.current = fitRevision; fit() } }, [fitRevision, fit, size.width])
  useEffect(() => {
    if (selected && !route) setCamera(current => ({ center: selected.location, zoom: Math.max(current.zoom, 14) }))
  }, [selected?.id, route])
  useEffect(() => {
    if (!result || dragging) return
    const controller = new AbortController()
    setStatus('loading')
    const timeout = setTimeout(() => {
      void transport.render({ ...camera, ...requestSize }, controller.signal).then(async incoming => {
        const probe = new Image(); probe.src = incoming.imageDataUrl
        await probe.decode()
        if (controller.signal.aborted) return
        setImage(incoming); setStatus('ready')
      }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    }, 140)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [transport, camera, requestSize, result?.provider, result?.mode, retry, dragging])
  useEffect(() => { if (!result) { setImage(undefined); setStatus('idle'); setAreaChanged(false) } }, [result])
  const pixelScale = size.width / requestSize.width
  const screen = (coordinate: Coordinate) => {
    const point = project(coordinate, camera.zoom), center = project(camera.center, camera.zoom)
    return { x: size.width / 2 + (point.x - center.x) * pixelScale, y: size.height / 2 + (point.y - center.y) * pixelScale }
  }
  let imageStyle: React.CSSProperties = {}
  if (image) {
    const center = screen(image.center), scale = 2 ** (camera.zoom - image.zoom) * pixelScale
    imageStyle = { width: image.width, height: image.height, transform: `translate(${center.x - image.width * scale / 2}px,${center.y - image.height * scale / 2}px) scale(${scale})` }
  }
  const zoom = (delta: number) => { setCamera(current => ({ ...current, zoom: Math.max(4, Math.min(17, current.zoom + delta)) })); setAreaChanged(true) }
  const controls = [
    { key: 'zoomIn', icon: Plus, label: t('map.zoomIn'), disabled: !result || camera.zoom >= 17, action: () => zoom(1) },
    { key: 'zoomOut', icon: Minus, label: t('map.zoomOut'), disabled: !result || camera.zoom <= 4, action: () => zoom(-1) },
    { key: 'fit', icon: LocateFixed, label: t('map.fit'), disabled: !places.length && !route, action: fit }
  ]
  const endDrag = () => {
    if (drag.current?.moved) setAreaChanged(true)
    drag.current = undefined; setDragging(false)
  }
  return <section className="plugin-map" aria-label={t('map.label')}>
    <div ref={container} id="viewport" className={`map-viewport ${dragging ? 'is-dragging' : ''}`} tabIndex={0} role="region" aria-label={t('map.label')} aria-describedby="map-help"
      onPointerDown={event => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, center: camera.center, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId); setDragging(true)
      }}
      onPointerMove={event => {
        const pointer = drag.current
        if (!pointer || pointer.id !== event.pointerId) return
        const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
        pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 4
        const center = project(pointer.center, camera.zoom)
        setCamera(current => ({ ...current, center: unproject({ x: center.x - dx / pixelScale, y: center.y - dy / pixelScale }, current.zoom) }))
      }} onPointerUp={endDrag} onPointerCancel={endDrag}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === '+' || event.key === '=') zoom(1)
        else if (event.key === '-') zoom(-1)
        else if (event.key === '0') fit()
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          const center = project(camera.center, camera.zoom)
          setCamera(current => ({ ...current, center: unproject({ x: center.x + (event.key === 'ArrowLeft' ? -70 : event.key === 'ArrowRight' ? 70 : 0), y: center.y + (event.key === 'ArrowUp' ? -70 : event.key === 'ArrowDown' ? 70 : 0) }, current.zoom) }))
          setAreaChanged(true)
        } else return
        event.preventDefault()
      }}>
      {image && <img id="map-image" className="map-image" src={image.imageDataUrl} alt="" draggable={false} style={imageStyle} />}
      {route && <svg className="route-layer" aria-hidden="true"><path id="route-path" d={route.path.map((coordinate, index) => { const point = screen(coordinate); return `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}` }).join(' ')} /></svg>}
      {places.map((place, index) => {
        const point = screen(place.location)
        if (point.x < -22 || point.y < -22 || point.x > size.width + 22 || point.y > size.height + 22) return null
        return <Button key={place.id} variant="outline" className="map-pin" data-selected={selected?.id === place.id} aria-pressed={selected?.id === place.id} aria-label={t('a11y.place', { number: index + 1, name: place.name })} style={{ left: point.x, top: point.y }} onClick={() => onSelect(place)}>
          <MapPin size={14} aria-hidden="true" />{index + 1}{selected?.id === place.id && <span className="pin-name">{place.name}</span>}
        </Button>
      })}
      {!result && <div className="map-empty"><MapPin className="size-7" aria-hidden="true" /><p>{t('map.empty')}</p></div>}
      {status === 'loading' && <span id="map-loading" className="map-loading" role="status"><RefreshCw className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('map.loading')}</span>}
      {status === 'error' && <div className="map-error" role="status"><span>{t('map.failed')}</span><Button className="maps-button map-touch-action" size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>{t('map.retry')}</Button></div>}
      {areaChanged && result && <Button className="maps-button map-touch-action search-area" size="sm" variant="outline" onClick={() => { onAreaSearch(camera.center); setAreaChanged(false) }}><SearchAreaIcon />{t('search.area')}</Button>}
      <div className="map-controls" role="group" aria-label={t('a11y.mapControls')}>{controls.map(control => <Tooltip key={control.key}><TooltipTrigger asChild><ActionButton variant="ghost" size="icon" aria-label={control.label} disabled={control.disabled} onClick={control.action}><control.icon className="size-4" aria-hidden="true" /></ActionButton></TooltipTrigger><TooltipContent side="left">{control.label}</TooltipContent></Tooltip>)}</div>
    </div>
    <div className="map-attribution"><span>{image?.attribution ?? result?.attribution ?? ''}</span>{result?.mode === 'demo' && <span>{t('map.demo')}</span>}</div>
    <p id="map-help" className="sr-only">{t('map.help')}</p>
  </section>
})
function SearchAreaIcon() { return <RefreshCw className="size-3.5" aria-hidden="true" /> }
