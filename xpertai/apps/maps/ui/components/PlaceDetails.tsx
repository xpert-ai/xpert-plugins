import { Button } from '@xpert-ai/plugin-shadcn-ui'
import { Copy, MapPin, MessageSquareQuote, Navigation, Phone, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { MapsModel } from '../state'
import { useMapsI18n, type MessageKey } from '../i18n'
export function PlaceDetails({ model }: { model: MapsModel }) {
  const { t } = useMapsI18n(), [copyStatus, setCopyStatus] = useState<MessageKey>()
  const place = model.selected
  if (!place) return null
  const copy = async () => {
    try { await navigator.clipboard.writeText(place.address); setCopyStatus('detail.copied') }
    catch { setCopyStatus('detail.copyFailed') }
  }
  return <div className="detail-layout">
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{place.category}</p>
      <h3 id="detail-title" className="mt-1 text-xl font-semibold tracking-tight">{place.name}</h3>
      {place.address && <div className="mt-2 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{place.address}</span>{typeof navigator.clipboard?.writeText === 'function' && <Button className="maps-button" variant="ghost" size="icon" aria-label={t('detail.copy')} onClick={() => void copy()}><Copy className="size-3.5" aria-hidden="true" /></Button>}</div>}
      {place.phone && <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-3.5" aria-hidden="true" />{place.phone}</p>}
      <div className="detail-actions">
        <Button onClick={model.openRoute} className="maps-button"><Navigation className="size-4" aria-hidden="true" />{t('detail.route')}</Button>
        <Button variant="outline" className="maps-button" disabled={!model.context.canReference} title={!model.context.canReference ? t('detail.referenceUnavailable') : undefined} onClick={() => void model.reference()}><MessageSquareQuote className="size-4" aria-hidden="true" />{t('detail.reference')}</Button>
      </div>
      {model.detailStatus === 'loading' && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><RefreshCw className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('map.loading')}</p>}
      {model.detailStatus === 'error' && <div className="mt-2 flex items-center gap-2 text-xs" role="status"><span>{t('detail.failed')}</span><Button className="maps-button" variant="ghost" size="sm" onClick={() => void model.select(place)}>{t('action.retry')}</Button></div>}
      {copyStatus && <p className="mt-2 text-xs text-muted-foreground" role="status">{t(copyStatus)}</p>}
    </div>
  </div>
}
