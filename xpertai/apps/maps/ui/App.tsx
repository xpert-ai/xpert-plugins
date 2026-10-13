import { useEffect, useLayoutEffect, useRef } from 'react'
import { Button, TooltipProvider } from '@xpert-ai/plugin-shadcn-ui'
import { X } from 'lucide-react'
import type { MapsTransport } from './transports/types'
import { useMaps, type MapsModel } from './state'
import { MapsI18nProvider, normalizeLocale, useMapsI18n } from './i18n'
import { installMapsTheme } from './theme'
import { MapCanvas, type MapCanvasHandle } from './components/MapCanvas'
import { ResultTray } from './components/ResultTray'
import { Toolbar } from './components/Toolbar'
export function MapsApp({ transport }: { transport: MapsTransport }) {
  const model = useMaps(transport), locale = normalizeLocale(model.context.locale)
  useLayoutEffect(() => { installMapsTheme(model.context.theme); document.documentElement.lang = locale }, [model.context.theme, locale])
  return <MapsI18nProvider locale={locale}><TooltipProvider><MapsWorkspace transport={transport} model={model} /></TooltipProvider></MapsI18nProvider>
}
function MapsWorkspace({ model, transport }: { model: MapsModel; transport: MapsTransport }) {
  const { t } = useMapsI18n(), map = useRef<MapCanvasHandle>(null)
  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || model.tray === 'results') return
      if (event.target instanceof HTMLElement && event.target.closest('[data-slot=select-content],[data-slot=popover-content]')) return
      model.back(); event.preventDefault()
    }
    document.addEventListener('keydown', back)
    return () => document.removeEventListener('keydown', back)
  }, [model.tray, model.back])
  return <main className="maps-plugin" data-surface={transport.surface}>
    <Toolbar model={model} />
    <MapCanvas ref={map} transport={transport} result={model.result} places={model.places} selected={model.selected} route={model.route} fitRevision={model.fitRevision} onSelect={place => void model.select(place)} onAreaSearch={center => void model.search({ center })} />
    <ResultTray model={model} />
    <footer className="plugin-footer"><span>{model.service ? t(model.service.provider === 'amap' ? 'provider.amap' : 'provider.tencent') : t('status.connecting')}</span>{model.service?.mode === 'demo' && <span>{t('mode.demo')}</span>}</footer>
    {model.notice && <div className="maps-notice" role="status"><p>{t(model.notice)}</p><Button variant="ghost" size="icon" className="maps-button shrink-0" aria-label={t('action.close')} onClick={model.dismissNotice}><X className="size-4" aria-hidden="true" /></Button></div>}
  </main>
}
