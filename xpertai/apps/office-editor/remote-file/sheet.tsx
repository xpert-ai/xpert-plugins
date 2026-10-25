import { t, useLocale, i18n, useMessage } from './i18n'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@xpert-ai/plugin-shadcn-ui'
import { Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@xpert-ai/plugin-shadcn-ui'
import React, { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { action, command, onEditorEvent, closePrepared } from './bridge'
import { DownloadButton } from './download'
const cellSchema = z.object({ row: z.number(), column: z.number(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]), formula: z.string().optional() })
const schema = z.object({ revision: z.string(), title: z.string(), canWrite: z.boolean(),
  document: z.object({ sheets: z.array(z.object({ id: z.string(), title: z.string(), rows: z.number(), columns: z.number(), cells: z.array(cellSchema) })) }) })
export function SheetEditor({ resourceId, providerKey }: { resourceId: string; providerKey: string }) {
  useLocale()
  const [state, setState] = useState<z.infer<typeof schema> | null>(null), [sheetId, setSheetId] = useState('')
  const [changes, setChanges] = useState<Record<string, string>>({}), [error, setError] = useMessage(''), [busy, setBusy] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)
  const [rowStart, setRowStart] = useState(0), [columnStart, setColumnStart] = useState(0)
  const sheet = state?.document.sheets.find((sheet) => sheet.id === sheetId)
  async function load() {
    setBusy(true)
    try {
      const response = schema.parse(await action('file.read', { resourceId, providerKey }))
      setState(response); setSheetId(id => response.document.sheets.some(sheet => sheet.id === id) ? id : response.document.sheets[0]?.id ?? '')
      setChanges({}); setError('')
    } finally { setBusy(false) }
  }
  useEffect(() => { let active = true; void action('file.read', { resourceId, providerKey }).then((raw) => { if (active) { const data = schema.parse(raw); setState(data); setSheetId(data.document.sheets[0]?.id ?? ''); } }).catch((error: Error) => setError(error)); return () => { active = false } }, [resourceId, providerKey])
  const changed = Object.keys(changes).length > 0
  useEffect(() => {
    void command('workbench.content.status', { resourceId, dirty: changed || busy,
      title: state?.title,
      label: t(changed ? 'sheet.unsaved' : 'sheet.saved') }).catch(() => undefined)
  }, [resourceId, changed, busy, state?.title])
  useEffect(() => onEditorEvent(event => {
    if (event.kind === 'prepareClose' && event.resourceId === resourceId)
      closePrepared(event.requestId, !changed && !busy)
  }), [resourceId, changed, busy])
  async function save() {
    if (!state) return
    setBusy(true); setError('')
    try {
      const cells = Object.entries(changes).map(([key, text]) => {
        const [row, column] = key.split(':').map(Number)
        if (text.startsWith('=')) return { row, column, value: '', formula: text.slice(1) }
        return { row, column, value: text === '' ? null : /^-?\d+(\.\d+)?$/u.test(text) ? Number(text) : text }
      })
      await action('file.save', { resourceId, providerKey, expectedRevision: state.revision, patch: { sheetId, cells } }); await load()
    } catch (error) { setError(error instanceof Error ? error : i18n.message('error.save')) } finally { setBusy(false) }
  }
  if (!state || !sheet) return <p role="status">{error || t('sheet.loading')}</p>
  return <section aria-label={t('sheet.label')}>
    <h1>{state.title}</h1><p className="muted">{t('sheet.limitations')}</p>
    {error && <p role="alert">{error.includes('conflict') ? t('sheet.conflict') : error}</p>}
    <div className="toolbar">
      <Select value={sheetId} disabled={changed || busy} onValueChange={(value) => { setSheetId(value); setRowStart(0); setColumnStart(0) }}><SelectTrigger aria-label={t('sheet.worksheet')}><SelectValue /></SelectTrigger><SelectContent position="popper">{state.document.sheets.map((sheet) => <SelectItem key={sheet.id} value={sheet.id}>{sheet.title}</SelectItem>)}</SelectContent></Select>
      {state.canWrite && <Button disabled={!changed || busy} onClick={() => void save()}>{t('sheet.save')}</Button>}
      <DownloadButton fileKey={JSON.stringify({ resourceId, providerKey })} disabled={busy} onError={(error) => setError(error instanceof Error ? error : i18n.message('error.download'))}>{t('sheet.download')}</DownloadButton>
      <Button disabled={busy} onClick={() => { if (changed) setConfirmReload(true); else void load().catch((error: Error) => setError(error)) }}>{t('sheet.reload')}</Button>
    </div>
    <div className="toolbar"><Button disabled={!rowStart} onClick={() => setRowStart(Math.max(0, rowStart - 20))}>{t('sheet.previousRows')}</Button><span>{t('sheet.rowRange', { start: rowStart + 1, end: Math.min(sheet.rows, rowStart + 20) })}</span><Button disabled={rowStart + 20 >= sheet.rows} onClick={() => setRowStart(rowStart + 20)}>{t('sheet.nextRows')}</Button>
      <Button disabled={!columnStart} onClick={() => setColumnStart(Math.max(0, columnStart - 8))}>{t('sheet.previousColumns')}</Button><Button disabled={columnStart + 8 >= sheet.columns} onClick={() => setColumnStart(columnStart + 8)}>{t('sheet.nextColumns')}</Button></div>
    <div className="grid-scroll"><Table><TableHeader><TableRow><TableHead>{t('sheet.rows')}</TableHead>{Array.from({ length: Math.min(8, sheet.columns - columnStart) }, (_, i) => <TableHead key={i}>{t('sheet.column', { column: columnStart + i + 1 })}</TableHead>)}</TableRow></TableHeader><TableBody>
      {Array.from({ length: Math.min(20, sheet.rows - rowStart) }, (_, i) => { const row = rowStart + i; return <TableRow key={row}><TableHead>{row + 1}</TableHead>{Array.from({ length: Math.min(8, sheet.columns - columnStart) }, (_, j) => {
        const column = columnStart + j, key = `${row}:${column}`, cell = sheet.cells.find((cell) => cell.row === row && cell.column === column)
        return <TableCell key={column}><Input aria-label={t('sheet.cell', { row: row + 1, column: column + 1 })} readOnly={!state.canWrite || busy} value={changes[key] ?? (cell?.formula ? `=${cell.formula}` : String(cell?.value ?? ''))} onChange={(event) => { setChanges({ ...changes, [key]: event.target.value }) }} /></TableCell>
      })}</TableRow> })}
    </TableBody></Table></div>
    <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('sheet.reloadTitle')}</AlertDialogTitle><AlertDialogDescription>{t('sheet.reloadDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void load().catch((error: Error) => setError(error))}>{t('common.reload')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
}
