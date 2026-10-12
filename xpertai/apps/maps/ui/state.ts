import { useCallback, useEffect, useRef, useState } from 'react'
import { mapSearchInputSchema, type Coordinate, type MapPlace, type MapResult, type MapRouteResult, type MapSearchInput } from '../src/lib/contracts'
import type { MessageKey } from './i18n'
import { type MapsIncoming, type MapsService, type MapsTransport, type MapsUiContext } from './transports/types'
export type TrayMode = 'results' | 'detail' | 'route'
export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'
export function useMaps(transport: MapsTransport) {
  const [context, setContext] = useState<MapsUiContext>({ locale: 'en-US', theme: { scheme: 'light' }, canReference: false })
  const [connected, setConnected] = useState(false)
  const [service, setService] = useState<MapsService>()
  const [result, setResult] = useState<MapResult>()
  const [places, setPlaces] = useState<MapPlace[]>([])
  const [selected, setSelected] = useState<MapPlace>()
  const [route, setRoute] = useState<MapRouteResult>()
  const [query, setQuery] = useState(''), [city, setCity] = useState('')
  const [tray, setTray] = useState<TrayMode>('results')
  const [searchStatus, setSearchStatus] = useState<AsyncStatus>('idle'), [detailStatus, setDetailStatus] = useState<AsyncStatus>('idle'), [routeStatus, setRouteStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<MessageKey>(), [notice, setNotice] = useState<MessageKey>()
  const [hasMore, setHasMore] = useState(false), [fitRevision, setFitRevision] = useState(0)
  const [routeOrigin, setRouteOrigin] = useState(''), [routeDestination, setRouteDestination] = useState('')
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving')
  const lastSearch = useRef<MapSearchInput>(), selectedRef = useRef<MapPlace>(), resultRef = useRef<MapResult>()
  const controllers = useRef(new Map<string, AbortController>())
  const cancel = useCallback((...channels: string[]) => { for (const channel of channels) { controllers.current.get(channel)?.abort(); controllers.current.delete(channel) } }, [])
  const request = useCallback((channel: string) => { cancel(channel); const controller = new AbortController(); controllers.current.set(channel, controller); return controller }, [cancel])
  const current = (channel: string, controller: AbortController) => !controller.signal.aborted && controllers.current.get(channel) === controller
  const fit = useCallback(() => setFitRevision(revision => revision + 1), [])
  const receive = useCallback(({ result: incoming, search }: MapsIncoming) => {
    if (incoming.kind === 'viewport') return
    cancel('search', 'detail', 'route')
    resultRef.current = incoming; setResult(incoming); setError(undefined); setNotice(undefined)
    if (search) { lastSearch.current = search; setQuery(search.query); setCity(search.city ?? '') }
    setRoute(undefined); setRouteStatus('idle')
    if (incoming.kind === 'places') {
      setPlaces(incoming.places); setHasMore(incoming.hasMore); setSelected(undefined); selectedRef.current = undefined
      setTray('results'); setSearchStatus('ready')
    } else if (incoming.kind === 'place') {
      setPlaces([incoming.place]); setSelected(incoming.place); selectedRef.current = incoming.place; setTray('detail'); setDetailStatus('ready'); setHasMore(false)
    } else {
      const endpoints: MapPlace[] = [
        { id: 'map-endpoint-origin', name: `${incoming.origin.lng}, ${incoming.origin.lat}`, location: incoming.origin, address: '' },
        { id: 'map-endpoint-destination', name: incoming.title, location: incoming.destination, address: '' }
      ]
      setPlaces(endpoints); setSelected(endpoints[1]); selectedRef.current = endpoints[1]
      setRouteOrigin(endpoints[0].id); setRouteDestination(endpoints[1].id); setTravelMode(incoming.travelMode)
      setRoute(incoming); setRouteStatus('ready'); setTray('route'); setHasMore(false)
    }
    fit()
  }, [cancel, fit])
  useEffect(() => {
    let active = true
    void transport.connect({ onContext: value => { if (active) setContext(value) }, onService: value => { if (active) setService(value) }, onResult: value => { if (active) receive(value) }, onError: () => { if (active) setError('status.failed') }, onReset: () => {
      if (!active) return
      for (const controller of controllers.current.values()) controller.abort()
      controllers.current.clear(); lastSearch.current = undefined; selectedRef.current = undefined; resultRef.current = undefined
      setService(undefined); setResult(undefined); setPlaces([]); setSelected(undefined); setRoute(undefined); setQuery(''); setCity(''); setHasMore(false)
      setTray('results'); setSearchStatus('idle'); setDetailStatus('idle'); setRouteStatus('idle'); setError(undefined); setNotice(undefined)
    } }).then(() => { if (active) setConnected(true) }).catch(() => { if (active) setError('status.failed') })
    return () => { active = false; for (const controller of controllers.current.values()) controller.abort(); transport.dispose() }
  }, [transport, receive])
  async function search(options: { query?: string; center?: Coordinate; more?: boolean } = {}) {
    const searchQuery = options.query ?? query
    if (!searchQuery.trim()) { setError('search.queryRequired'); return }
    const parsed = options.more && lastSearch.current
      ? mapSearchInputSchema.safeParse({ ...lastSearch.current, page: lastSearch.current.page + 1 })
      : mapSearchInputSchema.safeParse({ query: searchQuery, ...(options.center ? { center: options.center } : { city }) })
    if (!parsed.success) { setError('search.cityRequired'); return }
    setQuery(searchQuery); setError(undefined); setNotice(undefined); setSearchStatus('loading'); setTray('results')
    cancel('detail', 'route'); const controller = request('search')
    try {
      const incoming = await transport.search(parsed.data, controller.signal)
      if (!current('search', controller)) return
      lastSearch.current = parsed.data; resultRef.current = incoming; setResult(incoming)
      setPlaces(previous => options.more ? [...previous, ...incoming.places.filter(place => !previous.some(item => item.id === place.id))] : incoming.places)
      setSelected(undefined); selectedRef.current = undefined; setRoute(undefined); setRouteStatus('idle'); setHasMore(incoming.hasMore); setSearchStatus('ready'); fit()
    } catch { if (current('search', controller)) { setSearchStatus('error'); setError('result.failed') } }
  }
  async function select(place: MapPlace) {
    setSelected(place); selectedRef.current = place; setTray('detail'); setError(undefined); setNotice(undefined)
    if (resultRef.current?.kind === 'route') { setDetailStatus('ready'); return }
    cancel('route'); setRoute(undefined); setRouteStatus('idle'); setDetailStatus('loading')
    const controller = request('detail')
    try {
      const incoming = await transport.detail({ id: place.id }, controller.signal)
      if (!current('detail', controller) || selectedRef.current?.id !== place.id) return
      setSelected(incoming.place); selectedRef.current = incoming.place; setDetailStatus('ready')
    } catch { if (current('detail', controller)) setDetailStatus('error') }
  }
  function openRoute() {
    if (!selectedRef.current) return
    setTray('route'); setRouteDestination(selectedRef.current.id)
    setRouteOrigin(previous => previous && previous !== selectedRef.current?.id ? previous : places.find(place => place.id !== selectedRef.current?.id)?.id ?? '')
    setError(undefined)
  }
  function invalidateRoute() { cancel('route'); setRoute(undefined); setRouteStatus('idle') }
  async function planRoute() {
    const origin = places.find(place => place.id === routeOrigin), destination = places.find(place => place.id === routeDestination)
    if (!origin || !destination || origin.id === destination.id) { invalidateRoute(); setError('route.invalid'); return }
    cancel('detail'); const controller = request('route')
    setRoute(undefined); setRouteStatus('loading'); setError(undefined)
    try {
      const incoming = await transport.route({ origin: origin.location, destination: destination.location, travelMode }, controller.signal)
      if (!current('route', controller)) return
      setRoute(incoming); setRouteStatus('ready'); fit()
    } catch { if (current('route', controller)) setRouteStatus('error') }
  }
  async function reference() {
    if (!selected || !result) return
    setNotice(undefined); const controller = request('reference')
    try { await transport.reference(selected, result); if (current('reference', controller)) setNotice('detail.referenced') }
    catch { if (current('reference', controller)) setNotice('detail.referenceFailed') }
  }
  function back() {
    setError(undefined)
    if (tray === 'route') { invalidateRoute(); setTray('detail') }
    else { cancel('detail'); setTray('results') }
  }
  return { context, connected, service: result ?? service, result, places, selected, route, query, setQuery, city, setCity, tray, setTray, searchStatus, detailStatus, routeStatus, error, notice, hasMore, fitRevision, fit, search, select, openRoute, planRoute, reference, back, routeOrigin, routeDestination, travelMode,
    updateOrigin: (value: string) => { setRouteOrigin(value); invalidateRoute() }, updateDestination: (value: string) => { setRouteDestination(value); invalidateRoute() },
    updateMode: (value: 'driving' | 'walking') => { setTravelMode(value); invalidateRoute() },
    swapEndpoints: () => { setRouteOrigin(routeDestination); setRouteDestination(routeOrigin); invalidateRoute() },
    dismissNotice: () => setNotice(undefined)
  }
}
export type MapsModel = ReturnType<typeof useMaps>
