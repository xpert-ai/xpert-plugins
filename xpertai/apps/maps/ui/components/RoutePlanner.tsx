import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from '@xpert-ai/plugin-shadcn-ui'
import { ArrowDownUp, Car, Footprints, LoaderCircle, MapPin, Navigation } from 'lucide-react'
import type { MapsModel } from '../state'
import { useMapsI18n } from '../i18n'
export function RoutePlanner({ model }: { model: MapsModel }) {
  const { t, distance, duration } = useMapsI18n()
  return <div className="route-layout">
    <div className="min-w-0 space-y-3">
      <div className="route-fields">
        <label className="sr-only" htmlFor="route-origin">{t('route.origin')}</label>
        <Select value={model.routeOrigin} onValueChange={model.updateOrigin}><SelectTrigger id="route-origin" aria-label={t('route.origin')} className="maps-control w-full"><Navigation className="size-3.5 text-muted-foreground" aria-hidden="true" /><SelectValue placeholder={t('route.choose')} /></SelectTrigger><SelectContent className="maps-options" position="popper">{model.places.map(place => <SelectItem key={place.id} value={place.id}>{place.name}</SelectItem>)}</SelectContent></Select>
        <label className="sr-only" htmlFor="route-destination">{t('route.destination')}</label>
        <Select value={model.routeDestination} onValueChange={model.updateDestination}><SelectTrigger id="route-destination" aria-label={t('route.destination')} className="maps-control w-full"><MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" /><SelectValue placeholder={t('route.choose')} /></SelectTrigger><SelectContent className="maps-options" position="popper">{model.places.map(place => <SelectItem key={place.id} value={place.id}>{place.name}</SelectItem>)}</SelectContent></Select>
        <Button className="maps-button swap-endpoints" variant="ghost" size="icon" aria-label={t('route.swap')} onClick={model.swapEndpoints}><ArrowDownUp className="size-4" aria-hidden="true" /></Button>
      </div>
      <Tabs value={model.travelMode} onValueChange={value => { if (value === 'driving' || value === 'walking') model.updateMode(value) }}><TabsList className="maps-tabs grid w-full grid-cols-2" aria-label={t('a11y.routeMode')}><TabsTrigger value="driving"><Car className="size-4" aria-hidden="true" />{t('route.driving')}</TabsTrigger><TabsTrigger value="walking"><Footprints className="size-4" aria-hidden="true" />{t('route.walking')}</TabsTrigger></TabsList></Tabs>
      <Button className="maps-button w-full" onClick={() => void model.planRoute()} disabled={model.routeStatus === 'loading'}>{model.routeStatus === 'loading' && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{t('route.plan')}</Button>
    </div>
    <section className="route-summary" aria-live="polite">
      {model.routeStatus === 'loading' ? <p className="text-sm text-muted-foreground">{t('route.loading')}</p> : model.routeStatus === 'error' ? <div className="space-y-2"><p className="text-sm font-medium">{t('route.failed')}</p><Button className="maps-button" variant="outline" size="sm" onClick={() => void model.planRoute()}>{t('action.retry')}</Button></div> : model.route ? <>
        <p className="text-xs text-muted-foreground">{t(model.route.travelMode === 'driving' ? 'route.driving' : 'route.walking')}</p>
        <p id="route-metrics" className="mt-1 text-2xl font-semibold tracking-tight">{duration(model.route.durationSeconds)}<span className="ml-3 text-sm font-normal text-muted-foreground">{distance(model.route.distanceMeters)}</span></p>
        {!!model.route.steps?.length && <ol className="route-steps">{model.route.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
        {model.route.mode === 'demo' && <p className="mt-2 text-xs text-muted-foreground">{t('route.demo')}</p>}
      </> : <div className="space-y-2"><p className="text-sm font-medium">{t('route.initial')}</p><p className="text-xs text-muted-foreground">{t('route.initialHint')}</p></div>}
    </section>
  </div>
}
