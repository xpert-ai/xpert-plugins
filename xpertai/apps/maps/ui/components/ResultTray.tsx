import { useLayoutEffect, useRef, useState } from 'react'
import { Button, Separator } from '@xpert-ai/plugin-shadcn-ui'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, MapPin, Search } from 'lucide-react'
import type { MapsModel } from '../state'
import { useMapsI18n } from '../i18n'
import { PlaceDetails } from './PlaceDetails'
import { RoutePlanner } from './RoutePlanner'
export function ResultTray({ model }: { model: MapsModel }) {
  const { t, distance } = useMapsI18n(), [collapsed, setCollapsed] = useState(false)
  const body = useRef<HTMLDivElement>(null), previousMode = useRef(model.tray), listScroll = useRef(0), selectedButton = useRef<string>()
  useLayoutEffect(() => {
    if (model.tray !== 'results') setCollapsed(false)
    if (model.tray === 'results' && body.current) {
      body.current.scrollTop = listScroll.current
      if (previousMode.current !== 'results' && selectedButton.current) {
        const button = Array.from(body.current.querySelectorAll<HTMLButtonElement>('[data-place-id]')).find(button => button.dataset.placeId === selectedButton.current)
        button?.focus({ preventScroll: true })
      }
    }
    previousMode.current = model.tray
  }, [model.tray])
  const choose: MapsModel['select'] = place => {
    if (body.current) listScroll.current = body.current.scrollTop
    selectedButton.current = place.id
    return model.select(place)
  }
  return <section className={`result-tray tray-${model.tray} ${collapsed ? 'tray-collapsed' : ''}`} aria-label={t('a11y.results')}>
    <div className="tray-header">
      <div className="flex min-w-0 items-center gap-2">
        {model.tray !== 'results' && <Button variant="ghost" size="icon" className="maps-button -ml-2" aria-label={t(model.tray === 'route' ? 'route.back' : 'detail.back')} onClick={model.back}><ChevronLeft className="size-4" aria-hidden="true" /></Button>}
        <h2 className="truncate text-sm font-semibold">{model.tray === 'results' ? model.result?.kind === 'places' ? model.result.title : t('result.title') : t(model.tray === 'detail' ? 'detail.title' : 'route.title')}</h2>
        {model.tray === 'results' && <span className="shrink-0 text-xs text-muted-foreground">{t('result.count', { count: model.places.length })}</span>}
      </div>
      <Button className="maps-button" variant="ghost" size="icon" aria-label={t(collapsed ? 'tray.expand' : 'tray.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}</Button>
    </div>
    <Separator />
    {!collapsed && <div ref={body} className="tray-body" onScroll={() => { if (model.tray === 'results' && body.current) listScroll.current = body.current.scrollTop }}>
      {model.error && <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">{t(model.error)}</p>}
      {model.tray === 'detail' ? <PlaceDetails model={model} /> : model.tray === 'route' ? <RoutePlanner model={model} /> : model.searchStatus === 'loading' ? <div className="status-panel" role="status"><LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" /><p>{t('result.loading')}</p></div> : model.searchStatus === 'error' ? <div className="status-panel"><Search className="size-6" aria-hidden="true" /><p>{t('result.failed')}</p><p className="text-xs text-muted-foreground">{t('result.failureHint')}</p><Button className="maps-button" variant="outline" onClick={() => void model.search()}>{t('action.retry')}</Button></div> : model.places.length ? <>
        <div className="results-grid">{model.places.map((place, index) => <Button key={place.id} variant="ghost" className="place-card" data-place-id={place.id} aria-pressed={model.selected?.id === place.id} onClick={() => void choose(place)}>
          <span className="card-number">{index + 1}</span><span className="place-card-copy"><strong>{place.name}</strong><span>{[place.category, place.distanceMeters !== undefined ? distance(place.distanceMeters) : undefined].filter(Boolean).join(' · ')}</span>{place.address && <span className="truncate">{place.address}</span>}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>)}</div>
        {model.hasMore && <div className="px-4 pb-3"><Button variant="outline" className="maps-button w-full" onClick={() => void model.search({ more: true })}>{t('result.more')}</Button></div>}
      </> : <div className="status-panel"><MapPin className="size-6 text-muted-foreground" aria-hidden="true" /><p>{t(model.searchStatus === 'ready' ? 'result.empty' : 'result.initial')}</p><p className="max-w-xs text-xs text-muted-foreground">{t(model.searchStatus === 'ready' ? 'result.emptyHint' : 'result.initialHint')}</p></div>}
    </div>}
  </section>
}
