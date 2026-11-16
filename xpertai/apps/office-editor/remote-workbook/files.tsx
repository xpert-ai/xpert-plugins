import React, { useRef, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@xpert-ai/plugin-shadcn-ui'
import { action, fileAction } from '../remote-file/bridge'
import { t, useLocale } from '../remote-file/i18n'
import { workbookSchema } from '../src/lib/workbooks/native-schema'

export function WorkbookFiles(props: { open: boolean; onOpenChange(open: boolean): void; documentId: string;
  revision: string; canWrite: boolean; dirty: boolean; sheetId?: string; onImported(snapshot: z.infer<typeof workbookSchema>): void }) {
  useLocale()
  const input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const importFile = async (file?: File) => {
    if (!file || props.dirty || !props.canWrite) return
    if (file.size > 25 * 1024 * 1024) { setError(t('workbook.fileLimit')); return }
    setBusy(true); setError('')
    try {
      const result = z.object({ snapshot: workbookSchema }).parse(await fileAction('workbook.import', { documentId: props.documentId, expectedRevision: props.revision }, file))
      props.onImported(result.snapshot); props.onOpenChange(false)
    } catch (error) {
      setError(t(error instanceof Error && error.message.includes('workbook_date_system_unsupported') ? 'workbook.fileDateSystemUnsupported' : 'workbook.fileFailed'))
    } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const exportFile = async (format: 'xlsx' | 'csv' | 'native') => {
    setBusy(true); setError('')
    try {
      const file = z.object({ base64: z.string(), mimeType: z.string(), fileName: z.string() }).parse(await action('workbook.export', {
        documentId: props.documentId, expectedRevision: props.revision, format, ...(format === 'csv' && props.sheetId ? { sheetId: props.sheetId } : {})
      }))
      const bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType })), link = document.createElement('a')
      link.href = url; link.download = file.fileName; document.body.append(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('workbook.fileFailed')) } finally { setBusy(false) }
  }
  return <Dialog open={props.open} onOpenChange={open => { if (!busy) props.onOpenChange(open) }}><DialogContent>
    <DialogHeader><DialogTitle>{t('workbook.files')}</DialogTitle><DialogDescription>{t('workbook.fileFidelity')}</DialogDescription></DialogHeader>
    <p>{t('workbook.csvFidelity')}</p><p>{t('workbook.nativeBackupHelp')}</p><p>{t('workbook.fileLimit')}</p>
    {props.dirty && <p role="status">{t('workbook.fileDirty')}</p>}
    {error && <p role="alert">{error}</p>}
    <input ref={input} hidden type="file" accept=".xlsx,.csv,.xpert-workbook.json" onChange={event => void importFile(event.target.files?.[0])} />
    <Button disabled={busy || props.dirty || !props.canWrite} onClick={() => input.current?.click()}>{t('workbook.importDraft')}</Button>
    <Button variant="outline" disabled={busy || props.dirty} onClick={() => void exportFile('xlsx')}>{t('workbook.exportXlsx')}</Button>
    <Button variant="outline" disabled={busy || props.dirty} onClick={() => void exportFile('csv')}>{t('workbook.exportCsv')}</Button>
    <Button variant="outline" disabled={busy || props.dirty} onClick={() => void exportFile('native')}>{t('workbook.exportNative')}</Button>
  </DialogContent></Dialog>
}
