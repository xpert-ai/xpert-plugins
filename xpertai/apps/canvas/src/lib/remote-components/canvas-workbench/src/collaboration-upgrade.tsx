import React, { createElement as h } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from '../../../../../remote/locales/en.json'
import zh from '../../../../../remote/locales/zh-Hans.json'
import zhHant from '../../../../../remote/locales/zh-Hant.json'

export function CollaborationUpgrade({ open, onOpenChange, schemaVersion, disabled, locale, upgrade }: {
  open: boolean; onOpenChange(open: boolean): void
  schemaVersion: unknown; disabled: boolean; locale?: string; upgrade(): Promise<void>
}) {
  const [i18n] = React.useState(() => createRemoteI18n({ en, 'zh-Hans': zh, 'zh-Hant': zhHant }, locale ?? 'en'))
  const [running, setRunning] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  useRemoteLocale(i18n)
  React.useEffect(() => i18n.setLocale(locale), [locale, i18n])
  React.useEffect(() => { if (open) setFailed(false) }, [open])
  if (schemaVersion !== 1) return null
  return <RemoteI18nProvider i18n={i18n}>
    <Dialog open={open} onOpenChange={(value) => { if (!running) onOpenChange(value) }}>
      <DialogContent className="cw-conversion-dialog">
        <DialogHeader className="cw-conversion-header"><DialogTitle>{i18n.t('collaboration.title')}</DialogTitle>
          <DialogDescription>{i18n.t('collaboration.description')}</DialogDescription></DialogHeader>
        {failed ? <p role="alert" className="cw-conversion-note">{i18n.t('collaboration.failed')}</p> : null}
        <DialogFooter><Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>{i18n.t('collaboration.cancel')}</Button>
          <Button disabled={running || disabled} onClick={async () => {
            setRunning(true); setFailed(false)
            try { await upgrade(); onOpenChange(false) } catch { setFailed(true) } finally { setRunning(false) }
          }}>{i18n.t(running ? 'collaboration.busy' : 'collaboration.confirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </RemoteI18nProvider>
}
