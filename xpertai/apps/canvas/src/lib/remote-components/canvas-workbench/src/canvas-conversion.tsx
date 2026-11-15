import React, { createElement as h } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from '../../../../../remote/locales/en.json'
import zh from '../../../../../remote/locales/zh-Hans.json'
import zhHant from '../../../../../remote/locales/zh-Hant.json'

export function CanvasConversion({ open, onOpenChange, disabled, locale, revision, convert, openContent }: {
  open: boolean; onOpenChange(open: boolean): void
  disabled: boolean; locale?: string; revision: string
  convert(requestId: string, target: 'workbook' | 'document', revision: string): Promise<string>
  openContent(contentId: string): Promise<void>
}) {
  const [i18n] = React.useState(() => createRemoteI18n({ en, 'zh-Hans': zh, 'zh-Hant': zhHant }, locale ?? 'en'))
  useRemoteLocale(i18n)
  React.useEffect(() => i18n.setLocale(locale), [locale, i18n])
  React.useEffect(() => { if (open) setFailed(false) }, [open])
  const [running, setRunning] = React.useState(false), [failed, setFailed] = React.useState(false)
  const [target, setTarget] = React.useState<'workbook' | 'document'>('workbook')
  const [receipts, setReceipts] = React.useState<Partial<Record<'workbook' | 'document', { contentId: string; revision: string }>>>({})
  const created = receipts[target]
  const changed = Boolean(created && created.revision !== revision)
  const request = React.useRef<{ key: string; id: string } | null>(null)
  return <RemoteI18nProvider i18n={i18n}>
    <Dialog open={open} onOpenChange={value => { if (!running) onOpenChange(value) }}>
      <DialogContent className="cw-conversion-dialog">
        <DialogHeader className="cw-conversion-header"><DialogTitle>{i18n.t(changed ? 'conversion.updatedTitle' : created ? 'conversion.created' : 'conversion.title')}</DialogTitle>
          <DialogDescription>{i18n.t(changed ? 'conversion.updatedDescription' : 'conversion.description')}</DialogDescription></DialogHeader>
        <div className="cw-conversion-targets" role="group" aria-label={i18n.t('conversion.target')}>
          {(['workbook', 'document'] as const).map(kind => <Button key={kind} variant={target === kind ? 'default' : 'outline'}
            aria-pressed={target === kind} disabled={running} onClick={() => { setTarget(kind); setFailed(false) }}>{i18n.t(`conversion.${kind}`)}</Button>)}
        </div>
        {changed ? <p className="cw-conversion-note" role="status">{i18n.t('conversion.revisions')} {created?.revision} → {revision}</p> : null}
        {failed ? <p className="cw-conversion-note" role="alert">{i18n.t('conversion.failed')}</p> : null}
        <DialogFooter><Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>{i18n.t('collaboration.cancel')}</Button>
          {changed && created ? <Button variant="outline" disabled={running} onClick={async () => {
            setRunning(true); setFailed(false)
            try { await openContent(created.contentId); onOpenChange(false) } catch { setFailed(true) } finally { setRunning(false) }
          }}>{i18n.t('conversion.openPrevious')}</Button> : null}
          <Button disabled={running || disabled} onClick={async () => {
            setRunning(true); setFailed(false)
            try {
              if (created && !changed) { await openContent(created.contentId); onOpenChange(false) }
              else {
                const key = `${target}:${revision}`
                if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
                const contentId = await convert(request.current.id, target, revision)
                setReceipts(previous => ({ ...previous, [target]: { contentId, revision } }))
              }
            } catch { setFailed(true) } finally { setRunning(false) }
          }}>{i18n.t(running ? 'conversion.busy' : changed ? 'conversion.confirmUpdate' : created ? 'conversion.open' : 'conversion.confirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </RemoteI18nProvider>
}
