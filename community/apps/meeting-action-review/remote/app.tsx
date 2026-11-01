import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Input, Textarea, Label, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { connect, read, act, navigate, openAnalysis, currentConversation, ActionRejected, type Query, type Host } from './bridge'
import { i18n } from './i18n'
import { dataSchema, listSchema, detailSchema, type Detail, type List } from './dto'
import { createSchema, editItemsSchema } from '../src/lib/schemas'
import type { EditableItem } from '../src/lib/schemas'
import { LIMITS } from '../src/lib/constants'
import { newId } from './uuid'

type Pending = { key: string; input: Record<string, unknown> }
const editable = (d: Detail): EditableItem[] => (d.items ?? []).map(({ id, task, owner, deadlineText }) => ({ id, task, owner, deadlineText }))
const queryKey = (q: Query) => `${q.parameters?.mode ?? 'entry'}:${q.selectionId ?? ''}`
const t = i18n.t
function safeMessage(code: string) {
  const known = ['NOT_FOUND','VERSION_CONFLICT','VALIDATION_FAILED','OPERATION_CONFLICT','ALREADY_CONFIRMED','ASSISTANT_NOT_READY','BACKGROUND_UNAVAILABLE','ANALYSIS_TIMEOUT','ANALYSIS_FAILED','NO_VALID_RESULT','TEST_INJECTED_FAILURE'] as const
  const key = known.find(k => k === code)
  return key ? t(key) : t('error')
}
function App() {
  useRemoteLocale(i18n)
  const [query, setQuery] = useState<Query>({ parameters: { mode: 'entry' } })
  const [connected, setConnected] = useState(false)
  const [scopeGeneration, setScopeGeneration] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])
  const [list, setList] = useState<List>({ items: [] })
  const [cursor, setCursor] = useState<string>()
  const [title, setTitle] = useState(''), [sourceText, setSourceText] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<'opening' | 'failed' | 'synced' | ''>('')
  const [error, setError] = useState(''), [notice, setNotice] = useState<'saved' | 'verified' | ''>('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [leaveTo, setLeaveTo] = useState<Query | null>(null), [confirmOpen, setConfirmOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set()), [showSource, setShowSource] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ item: EditableItem; index: number } | null>(null)
  const requestSequence = useRef(0), lastHost = useRef<Host | null>(null), alive = useRef(true)
  const navigationLock = useRef(false), navigationSequence = useRef(0), syncedAttempt = useRef('')
  const automaticSync = useRef(true)
  const selectedQuery = useRef(query), preserveOnRead = useRef(false)
  const editor = useRef({ detail, items, dirty: false })
  const dirty = detail?.status === 'review_ready' && JSON.stringify(items) !== JSON.stringify(editable(detail))
  const inputDirty = query.parameters?.mode === 'new' && !!(title || sourceText)
  editor.current = { detail, items, dirty: !!dirty }
  const disabled = busy || !!pending || navigating
  const mode = query.parameters?.mode ?? 'entry'
  function applyDetail(next: Detail) {
    setDetail(next); setItems(editable(next)); setUndo(null); setNotice(''); setError('')
  }
  useEffect(() => {
    alive.current = true
    const dispose = connect((h, preserveRecord) => {
      i18n.setLocale(h.locale)
      const incoming = h.initialQuery ?? { parameters: { mode: 'entry' as const } }
      const previous = lastHost.current
      const scopeChanged = !previous || previous.instanceId !== h.instanceId || previous.scopeRevision !== h.scopeRevision
      const selectionChanged = queryKey(selectedQuery.current) !== queryKey(incoming)
      // External host navigation is outside this plugin's paired-navigation workflow.
      if (previous && scopeChanged && !preserveRecord) automaticSync.current = false
      if (scopeChanged || selectionChanged) {
        requestSequence.current++; setLoading(false)
        if (scopeChanged && !preserveRecord || selectionChanged || !previous) {
          requestSequence.current++; setDetail(null); setItems([]); setList({items:[]}); setTitle(''); setSourceText('')
          syncedAttempt.current = ''; setSessionStatus(''); setUndo(null)
        }
        preserveOnRead.current = !!previous && preserveRecord && !selectionChanged
        if (scopeChanged) setScopeGeneration(v => v + 1)
        selectedQuery.current = incoming; setQuery(incoming); setCursor(undefined); setError(''); setPending(null)
      }
      lastHost.current = h
      setConnected(true)
    })
    return () => { alive.current = false; requestSequence.current++; dispose() }
  }, [])
  async function load(poll = false) {
    if (!connected || mode === 'new' || (poll && (dirty || disabled))) return
    const requestId = ++requestSequence.current
    if (!poll) { setLoading(true); setError('') }
    try {
      const result = await read({ ...query, cursor })
      if (requestId !== requestSequence.current || !alive.current) return
      if (mode === 'list') setList(listSchema.parse(result))
      else {
        const parsed = dataSchema.parse(result)
        if (parsed.item) {
          const previous = editor.current
          if ((preserveOnRead.current || poll) && previous.dirty && previous.detail?.id === parsed.item.id) {
            if (previous.detail.revision === parsed.item.revision) setDetail(parsed.item)
            else setError('VERSION_CONFLICT')
          } else applyDetail(parsed.item)
          preserveOnRead.current = false
          // Bind the default latest record to host selection, so refreshing stays on this record.
          if (!query.selectionId) await go({ selectionId: parsed.item.id, parameters: { mode: 'detail' } })
        } else if (parsed.meta?.page === 'new') await go({ parameters: { mode: 'new' } })
      }
    } catch (e) { if (requestId === requestSequence.current) { setDetail(null); setError(e instanceof Error && e.message === 'NOT_FOUND' ? 'NOT_FOUND' : 'READ_ERROR') } }
    finally { if (requestId === requestSequence.current) setLoading(false) }
  }
  useEffect(() => { setExpanded(new Set()); setShowSource(false); setHighlight(null); void load() }, [connected, scopeGeneration, queryKey(query), cursor])
  useEffect(() => {
    const polling = mode === 'list' ? list.items.some(i => i.status === 'processing') : detail?.status === 'processing' || detail?.analysisSession.state === 'pending'
    if (!connected || !polling) return
    const timer = setInterval(() => { if (!document.hidden) void load(true) }, 2000)
    return () => clearInterval(timer)
  }, [connected, mode, detail?.status, list, queryKey(query), cursor, dirty, disabled])
  async function go(next: Query) {
    if (navigationLock.current) return
    navigationLock.current = true; setNavigating(true)
    const reload = queryKey(selectedQuery.current) === queryKey(next)
    automaticSync.current = true
    const intent = ++navigationSequence.current
    try {
      await navigate(next)
      if (!alive.current || intent !== navigationSequence.current) return
      if (queryKey(selectedQuery.current) !== queryKey(next)) { requestSequence.current++; setDetail(null); setItems([]) }
      setQuery(next); setCursor(undefined); setLeaveTo(null)
      selectedQuery.current = next; syncedAttempt.current = ''; setSessionStatus('')
      if (reload) { preserveOnRead.current = false; setScopeGeneration(v => v + 1) }
      setError(''); setNotice(''); setUndo(null)
      if (next.parameters?.mode === 'new') { setTitle(''); setSourceText(''); setDetail(null); setItems([]) }
    } catch { setError('NAVIGATION_FAILED') }
    finally { navigationLock.current = false; setNavigating(false) }
  }
  function requestGo(next: Query) {
    if (disabled || navigationLock.current) return
    if (dirty || inputDirty) setLeaveTo(next)
    else void go(next)
  }
  async function syncSession(record: Detail) {
    if (record.analysisSession.state !== 'ready' || navigationLock.current) return
    const key = `${record.id}:${record.analysisSession.number}`
    const intent = ++navigationSequence.current
    syncedAttempt.current = key
    navigationLock.current = true; setNavigating(true); setSessionStatus('opening')
    try {
      await openAnalysis(record.analysisSession)
      if (alive.current && intent === navigationSequence.current && selectedQuery.current.selectionId === record.id) setSessionStatus('synced')
    } catch {
      if (alive.current && intent === navigationSequence.current && selectedQuery.current.selectionId === record.id) setSessionStatus('failed')
    } finally { navigationLock.current = false; if (alive.current) setNavigating(false) }
  }
  useEffect(() => {
    if (!automaticSync.current || mode !== 'detail' || !detail || detail.id !== query.selectionId || detail.analysisSession.state !== 'ready' || disabled || loading || dirty) return
    const key = `${detail.id}:${detail.analysisSession.number}`
    if (currentConversation() === detail.analysisSession.conversationId) { syncedAttempt.current = key; setSessionStatus('synced'); return }
    if (syncedAttempt.current !== key) void syncSession(detail)
  }, [mode, detail, query.selectionId, disabled, loading, dirty])
  async function execute(operation: Pending, after?: Query) {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = detailSchema.parse(await act(operation.key, operation.input))
      if (!alive.current) return false
      setPending(null); applyDetail(result); setConfirmOpen(false)
      if (after) await go(after)
      else if (operation.key === 'create_analysis') await go({ selectionId: result.id, parameters: { mode: 'detail' } })
      else setNotice(operation.key === 'save_draft' ? 'saved' : 'verified')
      return true
    } catch (e) {
      if (e instanceof ActionRejected) {
        setPending(null); setLeaveTo(null); setError(e.message)
      } else { setPending(operation); setError('RESPONSE_UNKNOWN'); setConfirmOpen(false); setLeaveTo(null) }
      return false
    } finally { setBusy(false) }
  }
  async function verify() {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.key !== 'create_analysis' && detail) {
        const data = dataSchema.parse(await read({ selectionId: detail.id, parameters: { mode: 'detail' } }))
        if (!data.item) throw new Error('NOT_FOUND')
        const current = data.item
        if (current.confirmOperationId === pending.input.operationId || current.lastSaveOperationId === pending.input.operationId || current.status === 'confirmed') {
          applyDetail(current); setPending(null); setConfirmOpen(false); setNotice('verified'); return
        }
        if (pending.key !== 'retry_analysis' && current.revision !== pending.input.expectedRevision) {
          setPending(null); setError('VERSION_CONFLICT'); return
        }
      }
      await execute(pending)
    } catch { setError('RESPONSE_UNKNOWN') }
    finally { setBusy(false) }
  }
  async function create() {
    const parsed = createSchema.safeParse({ title, sourceText, operationId: newId() })
    if (!parsed.success) { setError('VALIDATION_FAILED'); return }
    await execute({ key: 'create_analysis', input: parsed.data })
  }
  function validItems() {
    const parsed = editItemsSchema.safeParse(items)
    if (!parsed.success) {
      setError('VALIDATION_FAILED')
      const index = parsed.error.issues[0]?.path[0]
      if (typeof index === 'number') document.getElementById(`task-${items[index]?.id}`)?.focus()
      return null
    }
    return parsed.data
  }
  async function save(confirm: boolean, after?: Query) {
    const valid = validItems()
    if (!detail || !valid) return
    await execute({ key: confirm ? 'confirm' : 'save_draft', input: {
      meetingId: detail.id, expectedRevision: detail.revision, operationId: newId(), items: valid
    } }, after)
  }
  function change(id: string, field: 'task' | 'owner' | 'deadlineText', value: string) {
    setNotice(''); setItems(previous => previous.map(item => item.id === id ? { ...item, [field]: field === 'task' ? value : value || null } : item))
  }
  const missingOwners = items.filter(i => !i.owner?.trim()).length, missingDates = items.filter(i => !i.deadlineText?.trim()).length
  const readonly = detail?.status === 'confirmed'
  const newQuery: Query = { parameters: { mode: 'new' } }, listQuery: Query = { parameters: { mode: 'list' } }
  function sourceNodes() {
    if (!detail) return null
    let offset = 0
    const nodes: React.ReactNode[] = []
    for (const segment of detail.sourceSegments.segments) {
      nodes.push(detail.sourceText.slice(offset, segment.start))
      nodes.push(<span id={`segment-${segment.id}`} key={segment.id} className={highlight === segment.id ? 'bg-accent text-accent-foreground' : ''}>{detail.sourceText.slice(segment.start, segment.end)}</span>)
      offset = segment.end
    }
    nodes.push(detail.sourceText.slice(offset)); return nodes
  }
  function locate(id: string) {
    setShowSource(true); setHighlight(id)
    requestAnimationFrame(() => document.getElementById(`segment-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }
  return <div className="workbench">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <h1>{t('app')}</h1><div className="flex gap-2">
        <Button variant="outline" disabled={disabled} onClick={() => requestGo(listQuery)}>{t('history')}</Button>
        <Button disabled={disabled} onClick={() => requestGo(newQuery)}>{t('new')}</Button>
      </div>
    </header>
    <main>
      {error && <div role="alert" className="my-3 text-destructive">{error === 'READ_ERROR' ? t('readError') : error === 'RESPONSE_UNKNOWN' ? t('uncertain') : safeMessage(error)}
        {pending ? <Button variant="outline" disabled={busy} onClick={() => void verify()}>{t('verify')}</Button> : error === 'READ_ERROR' || error === 'VERSION_CONFLICT' ? <Button variant="outline" disabled={busy} onClick={() => dirty ? setLeaveTo(query) : void load()}>{t('reload')}</Button> : null}
      </div>}
      {notice && <p role="status" className="my-2 text-muted-foreground">{t(notice)}</p>}
      {(!connected || loading) && <p role="status">{t('loading')}</p>}
      {mode === 'list' && !loading && <section>
        {!list.items.length && !error ? <p className="py-6 text-muted-foreground">{t('emptyHistory')}</p> : list.items.map(row => <Button key={row.id} variant="ghost" className="w-full justify-between gap-3" onClick={() => requestGo({ selectionId: row.id, parameters: { mode: 'detail' } })}>
          <span className="truncate">{row.title}</span><span className="text-muted-foreground">{safeStatus(row.status)} · {i18n.date(row.updatedAt)}</span>
        </Button>)}
        <div className="flex gap-2 py-3">{cursor && <Button variant="outline" onClick={() => setCursor(undefined)}>{t('first')}</Button>}{list.nextCursor && <Button variant="outline" onClick={() => setCursor(list.nextCursor)}>{t('next')}</Button>}</div>
      </section>}
      {mode === 'new' && <section className="grid gap-4 py-4">
        <p className="text-muted-foreground">{t('newHint')}</p>
        <div className="grid gap-2"><Label htmlFor="meeting-title">{t('title')}</Label><Input id="meeting-title" value={title} disabled={disabled} onChange={e => setTitle(e.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="meeting-source">{t('source')}</Label><Textarea id="meeting-source" rows={12} value={sourceText} disabled={disabled} onChange={e => setSourceText(e.target.value)} /></div>
        <p className="text-muted-foreground">{t('limits')}</p><Button disabled={disabled || !connected} onClick={() => void create()}>{busy ? t('loading') : t('extract')}</Button>
      </section>}
      {detail && mode !== 'new' && mode !== 'list' && !loading && <section className="grid gap-4 py-4">
        <div><h2>{detail.title}</h2><p className="text-muted-foreground">{safeStatus(detail.status)}</p></div>
        <div role="status" className="text-muted-foreground">
          {detail.analysisSession.state === 'pending' ? t('sessionPending') : detail.analysisSession.state === 'unavailable' ? t('sessionUnavailable') : sessionStatus === 'opening' ? t('sessionOpening') : sessionStatus === 'synced' ? t('sessionSynced') : t('sessionUnsynced')}
          {detail.analysisSession.state === 'ready' && sessionStatus !== 'opening' && sessionStatus !== 'synced' && <Button variant="outline" disabled={disabled} onClick={() => requestGo({ selectionId: detail.id, parameters: { mode: 'detail' } })}>{t('openSession')}</Button>}
        </div>
        <Button variant="outline" className="justify-start" onClick={() => setShowSource(v => !v)}>{showSource ? t('hideSource') : t('showSource')}</Button>
        {showSource && <pre className="whitespace-pre-wrap break-words border-b pb-4">{sourceNodes()}</pre>}
        {detail.status === 'processing' && <p role="status">{t('processing')}</p>}
        {detail.status === 'failed' && <div><p>{safeMessage(detail.attempt?.errorCode ?? 'ANALYSIS_FAILED')}</p><Button disabled={disabled} onClick={() => void execute({ key: 'retry_analysis', input: { meetingId: detail.id, expectedRevision: detail.revision, operationId: newId() } })}>{t('retry')}</Button></div>}
        {(detail.status === 'review_ready' || readonly) && <>
          <div><p>{t('summary', { count: items.length, owners: missingOwners, dates: missingDates })}</p><p className="text-muted-foreground">{t('reviewHint')}</p></div>
          {!items.length && <p>{t('emptyItems')}</p>}
          {items.map((item, index) => {
            const original = detail.initialItems?.find(i => i.id === item.id)
            const evidence = original?.sourceSegmentIds ?? []
            const adjusted = original && (original.task !== item.task || original.owner !== item.owner || original.deadlineText !== item.deadlineText)
            return <article key={item.id} className="grid gap-3 border-b pb-5" aria-label={`${t('task')} ${index + 1}`}>
              <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{index+1} · {original ? adjusted ? t('adjusted') : t('ai') : t('manual')}</span>
                {!readonly && <Button variant="ghost" disabled={disabled} onClick={() => { setUndo({ item, index }); setItems(prev => prev.filter(i => i.id !== item.id)) }}>{t('remove')}</Button>}
              </div>
              <div className="grid gap-2"><Label htmlFor={`task-${item.id}`}>{t('task')}</Label>{readonly ? <p>{item.task}</p> : <Textarea id={`task-${item.id}`} value={item.task} disabled={disabled} onChange={e => change(item.id, 'task', e.target.value)} />}</div>
              <div className="item-fields">
                <div className="grid gap-2"><Label htmlFor={`owner-${item.id}`}>{t('owner')}</Label>{readonly ? <p>{item.owner || t('unknown')}</p> : <Input id={`owner-${item.id}`} value={item.owner ?? ''} placeholder={t('unknown')} disabled={disabled} onChange={e => change(item.id,'owner',e.target.value)} />}</div>
                <div className="grid gap-2"><Label htmlFor={`deadline-${item.id}`}>{t('deadline')}</Label>{readonly ? <p>{item.deadlineText || t('unknown')}</p> : <Input id={`deadline-${item.id}`} value={item.deadlineText ?? ''} placeholder={t('unknown')} disabled={disabled} onChange={e => change(item.id,'deadlineText',e.target.value)} />}</div>
              </div>
              {original?.reviewNote && <p className="text-muted-foreground">{t('note')}：{original.reviewNote}</p>}
              {!!evidence.length && <Button variant="ghost" className="justify-start" onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })}>{t('evidence')}</Button>}
              {expanded.has(item.id) && evidence.map(id => {
                const segment = detail.sourceSegments.segments.find(s => s.id === id)
                return segment && <blockquote key={id} className="border-l pl-3"><p className="whitespace-pre-wrap">{detail.sourceText.slice(segment.start,segment.end)}</p><Button variant="ghost" onClick={() => locate(id)}>{t('locate')}</Button></blockquote>
              })}
            </article>
          })}
          {!readonly && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || items.length >= LIMITS.items} onClick={() => {
            const id = newId(); setItems(prev => [...prev, { id, task: '', owner: null, deadlineText: null }]); requestAnimationFrame(() => document.getElementById(`task-${id}`)?.focus())
          }}>{t('add')}</Button>{undo && <Button variant="ghost" disabled={disabled || items.length >= LIMITS.items} onClick={() => { setItems(prev => { const next = [...prev]; next.splice(undo.index,0,undo.item); return next }); setUndo(null) }}>{t('undo')}</Button>}</div>}
          {readonly && detail.confirmedAt && <p>{t('confirmedAt', { time: i18n.date(detail.confirmedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
        </>}
      </section>}
    </main>
    {detail?.status === 'review_ready' && mode === 'detail' && <footer className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
      {dirty && <span className="mr-auto text-muted-foreground">{t('dirty')}</span>}
      <Button variant="outline" disabled={disabled || !dirty} onClick={() => void save(false)}>{busy ? t('busy') : t('save')}</Button>
      <Button disabled={disabled} onClick={() => { if (validItems()) setConfirmOpen(true) }}>{t('confirm')}</Button>
    </footer>}
    <AlertDialog open={confirmOpen} onOpenChange={open => { if (!disabled) setConfirmOpen(open) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{items.length ? t('confirmBody', { count: items.length, owners: missingOwners, dates: missingDates }) : t('confirmEmpty')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter>
      <Button variant="outline" disabled={disabled} onClick={() => setConfirmOpen(false)}>{t('back')}</Button><Button disabled={disabled} onClick={() => void save(true)}>{t('confirmSave')}</Button>
    </AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!leaveTo} onOpenChange={open => { if (!open && !busy) setLeaveTo(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle><AlertDialogDescription>{inputDirty ? t('inputLost') : t('leaveBody')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter>
      <Button variant="outline" disabled={busy} onClick={() => setLeaveTo(null)}>{t('continue')}</Button>
      <Button variant="outline" disabled={busy} onClick={() => { if (leaveTo) { const next = leaveTo; setLeaveTo(null); void go(next) } }}>{t('discard')}</Button>
      {!inputDirty && <Button disabled={busy} onClick={() => { if (leaveTo) void save(false, leaveTo) }}>{t('saveLeave')}</Button>}
    </AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
function safeStatus(status: string) {
  return status === 'processing' ? t('analyzing') : status === 'review_ready' ? t('review_ready') : status === 'confirmed' ? t('confirmed') : t('failed')
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
