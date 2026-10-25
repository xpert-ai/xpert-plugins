import { t, useLocale, useMessage } from './i18n'
import React, { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@xpert-ai/plugin-shadcn-ui'
import { z } from 'zod/v3'
import { action } from './bridge'
import { errorText } from './model'

const snapshot = z.object({ sequence: z.number(), diskHash: z.string().nullable(), fileText: z.string(), documentText: z.string() })
export function FileConflictDialog({ itemId, localText, localUpdate, onClose, onResolved }: {
  itemId: string; localText: string; localUpdate: string; onClose: () => void; onResolved: () => void
}) {
  useLocale()
  const [value, setValue] = useState<z.infer<typeof snapshot> | null>(null)
  const [error, setError] = useMessage(''), [busy, setBusy] = useState(false)
  useEffect(() => { void action('page.conflict', { itemId }).then((raw) => setValue(snapshot.parse(raw))).catch((error) => setError(errorText(error))) }, [itemId])
  async function resolve(choice: 'file' | 'document') {
    if (!value?.diskHash) return
    setBusy(true); setError('')
    try {
      await action('page.reconcile', { itemId, choice, expectedSequence: value.sequence, expectedHash: value.diskHash, localUpdate })
      onResolved()
    } catch (error) {
      setError(errorText(error))
      try { setValue(snapshot.parse(await action('page.conflict', { itemId }))) } catch { setValue(null) }
    } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="space-dialog template-dialog">
    <DialogHeader><DialogTitle>{t('conflict.title')}</DialogTitle><DialogDescription>{t('conflict.description')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}
    {value ? <div className="form-columns"><section><h3>{t('conflict.fileVersion')}</h3><pre className="conflict-text">{value.fileText}</pre>
      <Button disabled={busy || !value.diskHash} onClick={() => void resolve('file')}>{t('conflict.useFile')}</Button></section>
      <section><h3>{t('conflict.pageVersion')}</h3><pre className="conflict-text">{localText || value.documentText}</pre>
        <Button variant="outline" disabled={busy || !value.diskHash} onClick={() => void resolve('document')}>{t('conflict.keepPage')}</Button></section></div> : <p role="status">{t('conflict.loading')}</p>}
  </DialogContent></Dialog>
}
