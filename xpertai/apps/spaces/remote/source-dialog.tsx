import { t, useLocale, i18n, useMessage } from './i18n'
import React, { useEffect, useRef, useState } from 'react'
import { Button, Input, Label, Checkbox, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { z } from 'zod/v3'
import { action } from './bridge'
import { errorText } from './model'
const sourcesSchema = z.object({ items: z.array(z.object({ bindingId: z.string(), provider: z.string(), available: z.boolean(), status: z.string(),
  label: z.union([z.string(), z.record(z.string())]), scope: z.object({ type: z.enum(['workspace', 'project']) }) })) })
const listSchema = z.object({ items: z.array(z.object({ id: z.string(), title: z.string(), url: z.string().nullable() })), nextCursor: z.string().nullable() })
const previewSchema = z.object({ id: z.string(), title: z.string(), url: z.string().nullable(), revision: z.string(), contentHash: z.string(),
  provider: z.string(), format: z.literal('text/plain'), content: z.string(), warnings: z.array(z.string()) })
const message = (error: unknown) => {
  const text = error instanceof Error ? error.message : ''
  if (/unsupported_locator/u.test(text)) return i18n.message('source.error.locator')
  if (/unsupported_document_type/u.test(text)) return i18n.message('source.error.type')
  if (/source_access_denied/u.test(text)) return i18n.message('source.error.access')
  if (/provider_rejected|connection_required|request_failed/u.test(text)) return i18n.message('source.error.connection')
  if (/source_changed/u.test(text)) return i18n.message('source.error.changed')
  if (/too_large/u.test(text)) return i18n.message('source.error.size')
  return errorText(error)
}
export function SourceDialog({ spaceId, parentId, destination, onClose, onDone, returnFocus }: {
  spaceId: string; parentId: string | null; destination: string; onClose: () => void; onDone: () => Promise<void>; returnFocus: () => void
}) {
  useLocale()
  const connectionLabel = (source: z.infer<typeof sourcesSchema>['items'][number]) => {
    const label = t('source.connectionLabel', { provider: i18n.label(source.label, source.provider), scope: source.scope.type === 'project' ? t('source.projectScope') : t('source.workspaceScope') })
    return source.available ? label : t('source.disconnected', { label })
  }
  const [sources, setSources] = useState<z.infer<typeof sourcesSchema>['items']>([]), [bindingId, setBindingId] = useState('')
  const [query, setQuery] = useState(''), [searchedQuery, setSearchedQuery] = useState(''), [locator, setLocator] = useState('')
  const [entries, setEntries] = useState<z.infer<typeof listSchema>['items']>([]), [cursor, setCursor] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(null), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(true), [error, setError] = useMessage(''), [loaded, setLoaded] = useState(false)
  const requestId = useRef(crypto.randomUUID()), alive = useRef(true)
  async function loadSources() {
    setBusy(true); setError('')
    try { const result = sourcesSchema.parse(await action('source.list', {})); if (alive.current) { setSources(result.items); setBindingId(result.items.find((x) => x.available)?.bindingId ?? ''); setLoaded(true) } }
    catch (error) { if (alive.current) setError(message(error)) } finally { if (alive.current) setBusy(false) }
  }
  useEffect(() => { alive.current = true; void loadSources(); return () => { alive.current = false } }, [])
  function resetPreview() { setPreview(null); setConfirmed(false); requestId.current = crypto.randomUUID() }
  async function search(more = false) {
    setBusy(true); setError(''); resetPreview()
    try {
      const value = more ? searchedQuery : query
      const result = listSchema.parse(await action('source.search', { bindingId, query: value, ...(more && cursor ? { cursor } : {}), pageSize: 25 }))
      if (alive.current) { setEntries((old) => more ? [...new Map([...old, ...result.items].map((x) => [x.id, x])).values()] : result.items); setCursor(result.nextCursor); setSearchedQuery(value); setSearched(true) }
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  async function read(value: string) {
    setLocator(value); resetPreview(); setBusy(true); setError('')
    try { const result = previewSchema.parse(await action('source.preview', { bindingId, locator: value })); if (alive.current) setPreview(result) }
    catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="space-dialog max-h-[85vh] overflow-y-auto"
    onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus() }}>
    <DialogHeader><DialogTitle>{t('source.title')}</DialogTitle><DialogDescription>{t('source.description')}</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}
    {!loaded && !busy && <Button variant="outline" onClick={() => void loadSources()}>{t('source.retryConnections')}</Button>}
    {loaded && !sources.length ? <div><p>{t('source.noConnections')}</p><p className="muted">{t('source.setupHint')}</p><Button variant="outline" disabled={busy} onClick={() => void loadSources()}>{t('source.recheck')}</Button></div> : <>
      <div className="form-field"><Label htmlFor="document-source">{t('source.provider')}</Label>
        <Select value={bindingId} disabled={busy} onValueChange={(value) => { setBindingId(value); setEntries([]); setCursor(null); setSearched(false); setLocator(''); resetPreview() }}>
          <SelectTrigger id="document-source" className="w-full"><SelectValue placeholder={t('source.chooseConnection')} /></SelectTrigger>
          <SelectContent position="popper">{sources.map((source) => <SelectItem key={source.bindingId} value={source.bindingId} disabled={!source.available}>
            {connectionLabel(source)}
          </SelectItem>)}</SelectContent>
        </Select>
      </div><Button variant="outline" disabled={busy} onClick={() => { resetPreview(); setEntries([]); setCursor(null); setSearched(false); void loadSources() }}>{t('source.recheckConnections')}</Button>
      <p className="muted text-sm">{t('source.searchHint')}</p>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void search() }}><Input aria-label={t('source.searchLabel')} value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder={t('source.searchPlaceholder')} disabled={busy} /><Button disabled={busy || !bindingId}>{t('source.search')}</Button></form>
      <div className="flex gap-2"><Input aria-label={t('source.linkLabel')} value={locator} onChange={(event) => { setLocator(event.target.value); resetPreview() }} placeholder={t('source.linkPlaceholder')} disabled={busy} /><Button variant="outline" disabled={busy || !bindingId || !locator.trim()} onClick={() => void read(locator.trim())}>{t('common.preview')}</Button></div>
      {!!entries.length && <ul className="max-h-48 overflow-y-auto">{entries.map((entry) => <li key={entry.id}><Button className="max-w-full justify-start truncate" variant="ghost" disabled={busy} onClick={() => void read(entry.url ?? entry.id)}>{entry.title}</Button></li>)}</ul>}
      {searched && !entries.length && <p className="muted">{t('source.emptyPage')}</p>}
      {cursor && <Button variant="outline" disabled={busy} onClick={() => void search(true)}>{t('common.loadMore')}</Button>}
      {preview && <section className="space-y-3"><h3>{preview.title}</h3><p className="muted text-sm">{t('source.previewMeta', { revision: preview.revision, destination })}</p>
        {preview.url && <a href={preview.url} target="_blank" rel="noopener noreferrer" className="underline">{t('source.openOriginal')}</a>}
        {preview.warnings.map((warning) => <p key={warning} role="note">{warning}</p>)}
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border p-3 text-sm">{preview.content || t('source.emptyText')}</pre>
        <div className="confirmation-field"><Checkbox id="confirm-source-import" disabled={busy} checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="confirm-source-import">{t('source.confirmation')}</Label></div>
      </section>}
    </>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy || !preview || !confirmed} onClick={() => {
      if (!preview) return
      setBusy(true); setError('')
      void action('source.import', { bindingId, locator, spaceId, parentId, requestId: requestId.current,
        expectedRevision: preview.revision, expectedHash: preview.contentHash, confirmed: true })
        .then(async () => { await onDone(); onClose() }).catch((error) => setError(message(error))).finally(() => setBusy(false))
    }}>{busy ? t('common.processing') : t('source.import')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
