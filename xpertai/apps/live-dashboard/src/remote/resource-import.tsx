import * as React from 'react'
import { z } from 'zod/v3'
import { Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@xpert-ai/plugin-shadcn-ui'
import { libraryAction } from './library-gateway'
import { captureViewScope, requestHost } from './bridge'
import { limits } from '../lib/library/resource-contract'
import type { messages } from './i18n'
const jobSchema = z.object({ importId: z.string().uuid(), status: z.enum(['prepared','running','failed','complete','cancelled']), createdAt: z.string(), failureCode: z.string().nullable(),
  releaseIds: z.array(z.string()), items: z.array(z.object({ logicalId: z.string(), version: z.string(), title: z.string(), outcome: z.enum(['create','reuse','conflict']) })) })
const jobsSchema = z.array(jobSchema.omit({ items: true }))
type T = ReturnType<typeof messages>
/** @beta Resource ZIP import UI; its host actions and job states may change incompatibly. */
export function ResourceImport({ t, open, onClose, onImported }: { t: T; open: boolean; onClose(): void; onImported(): void }) {
  const [mode, setMode] = React.useState<'reuse'|'copy'>('reuse'), [pending, setPending] = React.useState<z.infer<typeof jobSchema>>()
  const [jobs, setJobs] = React.useState<z.infer<typeof jobsSchema>>([]), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
  const lock = React.useRef(false), alive = React.useRef(true), uploadIntent = React.useRef<{ file: File; mode: string; id: string }>()
  React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function run(work: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError('')
    try { await work() } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : t.error) }
    finally { lock.current = false; if (alive.current) setBusy(false) } }
  React.useEffect(() => { if (open) void run(async () => { const result = await libraryAction('resource-jobs', {}, jobsSchema); if (alive.current) setJobs(result) }) }, [open])
  async function upload(file: File) {
    if (file.size > limits.archiveBytes) throw Error('LIBRARY_ARCHIVE_LIMIT')
    const assertCurrent = captureViewScope()
    if (uploadIntent.current?.file !== file || uploadIntent.current.mode !== mode) uploadIntent.current = { file, mode, id: crypto.randomUUID() }
    const buffer = await file.arrayBuffer(); assertCurrent()
    const result = z.object({ success: z.literal(true), data: jobSchema }).parse(await requestHost('executeFileAction', { actionKey: 'resource-import',
      input: { mode, requestId: uploadIntent.current.id }, file: { name: file.name, type: file.type, size: file.size, buffer } }))
    if (alive.current) setPending(result.data)
  }
  const status = (value: z.infer<typeof jobSchema>['status']) => ({ prepared: t.catalogStatusPrepared, running: t.catalogStatusCommitting, failed: t.catalogStatusFailed, complete: t.catalogStatusComplete, cancelled: t.v2Cancelled }[value])
  const terminal = pending?.status === 'complete' || pending?.status === 'cancelled'
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose() }}><DialogContent className="dashboard-import-dialog overflow-y-auto">
    <DialogHeader><DialogTitle>{t.catalogImport}</DialogTitle><DialogDescription>{t.v2ImportHint}</DialogDescription></DialogHeader>
    <label className="grid gap-2 text-sm">{t.catalogConflictMode}<Select value={mode} onValueChange={value => setMode(z.enum(['reuse','copy']).parse(value))} disabled={busy}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="reuse">{t.catalogReuse}</SelectItem><SelectItem value="copy">{t.catalogCopy}</SelectItem></SelectContent></Select></label>
    <label className="grid gap-2 text-sm">{t.catalogZipFile}<Input type="file" accept=".zip" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => upload(file)) }}/></label>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {pending && <section className="space-y-3"><p role="status">{t.catalogImportPreview} · {status(pending.status)}</p>{pending.failureCode && <p className="text-sm text-destructive">{pending.failureCode}</p>}
      {!!pending.items.length && <Table><TableHeader><TableRow><TableHead>{t.catalogTitle}</TableHead><TableHead>{t.catalogOutcome}</TableHead></TableRow></TableHeader><TableBody>{pending.items.map(item => <TableRow key={`${item.logicalId}:${item.version}`}><TableCell>{item.title} · {item.version}</TableCell><TableCell>{item.outcome === 'create' ? t.catalogWillCreate : item.outcome === 'reuse' ? t.catalogWillReuse : t.catalogConflict}</TableCell></TableRow>)}</TableBody></Table>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || terminal || pending.status === 'running' || pending.items.some(item => item.outcome === 'conflict')} onClick={() => void run(async () => { const result = await libraryAction('resource-import-commit', { importId: pending.importId }, jobSchema); if (alive.current) { setPending(result); onImported() } })}>{t.catalogConfirmImport}</Button>
        <Button variant="outline" disabled={busy || terminal} onClick={() => void run(async () => { const result = await libraryAction('resource-import-status', { importId: pending.importId }, jobSchema); if (alive.current) { setPending(result); if (result.status === 'complete') onImported() } })}>{t.refresh}</Button>
        <Button variant="ghost" disabled={busy || terminal || pending.status === 'running'} onClick={() => void run(async () => { const result = await libraryAction('resource-import-cancel', { importId: pending.importId }, jobSchema); if (alive.current) setPending(result) })}>{t.cancel}</Button></div></section>}
    {!!jobs.length && <section className="space-y-2"><h3 className="text-sm font-medium">{t.catalogRecentImports}</h3>{jobs.map(job => <Button className="w-full justify-start" variant="ghost" disabled={busy} key={job.importId} onClick={() => void run(async () => { const result = await libraryAction('resource-import-status', { importId: job.importId }, jobSchema); if (alive.current) setPending(result) })}>{new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(job.createdAt))} · {status(job.status)}</Button>)}</section>}
  </DialogContent></Dialog>
}
