import * as React from 'react'
import { Button, Badge, Input, Textarea, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { ClipboardCheck, Plus, RefreshCw, Save, Check, List, ChevronLeft, ChevronRight } from 'lucide-react'
import { emptyReport, reportKeys, type IntakeRecord, type Report, type ViewData } from '../shared/contracts'
import { HostBridge } from './bridge'
import { errorKey, i18n, type MessageKey } from './i18n'
import { AnalysisButton, AnalysisPanel, FieldEvidence } from './analysis-panel'
import { mergeLocalDraft } from '../shared/reconcile'
import { trace } from './debug'

const { t } = i18n
const initialData: ViewData = { items: [], item: null, total: 0, meta: { page: 1, pageSize: 25 } }
const answersKey = (value: Record<string, string>) => JSON.stringify(Object.entries(value).filter(([, text]) => text !== '').sort(([left], [right]) => left.localeCompare(right)))

export function Workbench({ bridge }: { bridge: HostBridge }) {
  useRemoteLocale(i18n)
  const [data, setData] = React.useState(initialData)
  const [record, setRecord] = React.useState<IntakeRecord | null>(null)
  const [report, setReport] = React.useState<Report>(emptyReport)
  const [supplement, setSupplement] = React.useState('')
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [search, setSearch] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState<MessageKey | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [feedback, setFeedback] = React.useState('')
  const [createId, setCreateId] = React.useState(() => crypto.randomUUID())
  const [confirming, setConfirming] = React.useState(false)
  const [showSnapshot, setShowSnapshot] = React.useState(false)
  const [deferred, setDeferred] = React.useState<(() => void) | null>(null)
  const [showList, setShowList] = React.useState(false)
  const answersDirty = !!record && answersKey(answers) !== answersKey(Object.fromEntries(record.answers.map(answer => [answer.questionId, answer.text])))
  const dirty = !!record && (supplement !== record.supplement || JSON.stringify(report) !== JSON.stringify(record.report) || answersDirty)
  const analyzing = record?.analysis?.status === 'queued' || record?.analysis?.status === 'running'
  const requestSequence = React.useRef(0)
  const latest = React.useRef({ record, dirty, answersDirty, report, query, page, busy })
  latest.current = { record, dirty, answersDirty, report, query, page, busy }
  const analysisRequest = React.useRef<{ id: string; recordId: string; revision: number } | null>(null)

  const adopt = (value: IntakeRecord | null) => {
    setRecord(value); setReport(value?.report ?? emptyReport()); setSupplement(value?.supplement ?? '')
    setAnswers(Object.fromEntries((value?.answers || []).map(answer => [answer.questionId, answer.text])))
  }
  const fail = (value: unknown) => setError(errorKey(value instanceof Error ? value : new Error('storage_unavailable')))
  const load = async (id = '', nextQuery = query, nextPage = page, replace = true) => {
    const request = ++requestSequence.current
    setBusy(true); setError(null)
    try {
      let value = await bridge.query(id, nextQuery, nextPage)
      if (replace && !id && value.items.length) value = await bridge.query(value.items[0].id, nextQuery, nextPage)
      if (request !== requestSequence.current) return
      setData(value)
      if (replace) adopt(value.item)
    } catch (value) { if (request === requestSequence.current) fail(value) }
    finally { if (request === requestSequence.current) setBusy(false) }
  }
  React.useEffect(() => { void load(); return () => { requestSequence.current++ } }, [bridge])
  const applyIncoming = (value: ViewData) => {
    const base = latest.current.record
    if (!base || !value.item || latest.current.busy || value.item.id !== base.id || value.item.revision < base.revision) return
    setData(value); trace('analysis.poll')
    if (!latest.current.dirty) adopt(value.item)
    else {
      const merged = mergeLocalDraft(base, value.item, latest.current.report, latest.current.answersDirty)
      if (merged.kind === 'merged') { setRecord(value.item); setReport(merged.report); trace('analysis.merge') }
      else if (merged.kind === 'metadata') setRecord(previous => previous ? { ...previous, analysis: value.item?.analysis || null } : previous)
      else if (merged.kind === 'conflict') { setRecord(previous => previous ? { ...previous, analysis: value.item?.analysis || null } : previous); setError('error.revision_conflict'); trace('analysis.conflict') }
    }
  }
  React.useEffect(() => bridge.onHostEvent(() => {
    const current = latest.current
    if (!current.record || current.busy) return
    void bridge.query(current.record.id, current.query, current.page).then(applyIncoming).catch(() => {})
  }), [bridge])
  React.useEffect(() => {
    if (!record?.id || !analyzing) return
    const recordId = record.id
    let disposed = false
    let pending = false
    const poll = async () => {
      if (pending || latest.current.busy) return
      pending = true
      try {
        const current = latest.current
        const value = await bridge.query(recordId, current.query, current.page)
        if (disposed || latest.current.record?.id !== recordId || !value.item || latest.current.busy) return
        applyIncoming(value)
      } catch { /* Keep the draft; a later poll or explicit reload can recover connectivity. */ }
      finally { pending = false }
    }
    const timer = setInterval(() => { void poll() }, 2000)
    return () => { disposed = true; clearInterval(timer) }
  }, [bridge, record?.id, record?.analysis?.id, analyzing])

  const guard = (action: () => void) => {
    if (busy) return
    if (dirty) setDeferred(() => action)
    else action()
  }
  const select = (id: string) => guard(() => { setShowList(false); void load(id) })
  const startCreate = () => guard(() => { setCreateId(crypto.randomUUID()); setFeedback(''); setError(null); setCreating(true) })
  const create = async () => {
    if (!feedback.trim()) { setError('error.blank_feedback'); return }
    setBusy(true); setError(null)
    try {
      const value = await bridge.action('create', null, { requestId: createId, originalFeedback: feedback })
      adopt(value); setCreating(false); setShowList(false); setPage(1); setQuery(''); setSearch('')
      await load(value.id, '', 1, false)
    } catch (value) { fail(value) }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!record) return
    setBusy(true); setError(null)
    try {
      const value = await bridge.action('save', record.id, { revision: record.revision, report, supplement, answers: Object.entries(answers).map(([questionId, text]) => ({ questionId, text })) })
      adopt(value)
      await load(value.id, query, page, false)
    } catch (value) { fail(value) }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!record) return
    setBusy(true); setError(null)
    try {
      const value = await bridge.action('confirm', record.id, { revision: record.revision })
      adopt(value); setConfirming(false)
      await load(value.id, query, page, false)
    } catch (value) { setConfirming(false); fail(value) }
    finally { setBusy(false) }
  }
  const analyze = async () => {
    if (!record || dirty || analyzing || busy) return
    if (analysisRequest.current?.recordId !== record.id || analysisRequest.current.revision !== record.revision) analysisRequest.current = { id: crypto.randomUUID(), recordId: record.id, revision: record.revision }
    setBusy(true); setError(null)
    try {
      const value = await bridge.action('analyze', record.id, { revision: record.revision, requestId: analysisRequest.current.id })
      analysisRequest.current = null
      adopt(value)
    } catch (value) { fail(value) }
    finally { setBusy(false) }
  }
  const applySearch = (event: React.FormEvent) => {
    event.preventDefault()
    guard(() => { setQuery(search); setPage(1); void load(record?.id, search, 1) })
  }
  const changePage = (next: number) => guard(() => { setPage(next); void load(record?.id, query, next) })

  return <main className="intake-shell bg-background text-foreground">
    <header className="intake-header border-b">
      <div className="intake-heading"><ClipboardCheck className="size-6 text-primary" aria-hidden /><div><h1 className="text-lg font-semibold">{t('app.title')}</h1><p className="text-sm text-muted-foreground">{t('app.description')}</p></div></div>
      <Button onClick={startCreate} disabled={busy}><Plus aria-hidden />{t('action.create')}</Button>
    </header>
    <div className="intake-phase border-b bg-muted/40 text-sm"><Badge variant="secondary">{t('app.phase')}</Badge><span className="text-muted-foreground">{t('app.phaseHint')}</span></div>
    <div className="intake-body">
      <aside className={`intake-sidebar border-r ${showList ? 'is-open' : ''}`} aria-label={t('action.list')}>
        <form className="intake-search" onSubmit={applySearch}><Input aria-label={t('list.search')} placeholder={t('list.search')} value={search} onChange={event => setSearch(event.target.value)} disabled={busy} /><Button variant="outline" size="icon" disabled={busy} aria-label={t('list.search')}><List aria-hidden /></Button></form>
        <div className="intake-list" aria-busy={busy}>
          {!data.items.length && <div className="intake-empty text-muted-foreground"><ClipboardCheck aria-hidden className="size-8" /><p className="font-medium">{t(query ? 'list.noMatches' : 'list.empty')}</p>{!query && <p className="text-sm">{t('list.emptyHint')}</p>}</div>}
          {data.items.map(item => <Button key={item.id} variant={record?.id === item.id ? 'secondary' : 'ghost'} className="intake-list-item" onClick={() => select(item.id)} disabled={busy} aria-pressed={record?.id === item.id}>
            <span className="intake-list-title">{item.title || item.preview || t('list.untitled')}</span><span className="intake-list-preview text-xs text-muted-foreground">{item.preview}</span><span className="intake-list-meta"><Badge variant="outline">{t(`state.${item.status}`)}</Badge><span className="text-xs text-muted-foreground">{i18n.date(item.updatedAt, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span>
          </Button>)}
        </div>
        <footer className="intake-pagination border-t text-xs text-muted-foreground"><span>{t('state.total', { count: data.total })}</span><Button variant="ghost" size="icon" aria-label={t('action.previous')} onClick={() => changePage(page - 1)} disabled={busy || page <= 1}><ChevronLeft aria-hidden /></Button><span>{t('state.page', { page })}</span><Button variant="ghost" size="icon" aria-label={t('action.next')} onClick={() => changePage(page + 1)} disabled={busy || page * data.meta.pageSize >= data.total}><ChevronRight aria-hidden /></Button></footer>
      </aside>
      <section className="intake-detail">
        <div className="intake-toolbar border-b"><Button variant="outline" className="intake-list-toggle" onClick={() => setShowList(!showList)}>{t('action.list')}</Button><span role="status" className="text-sm text-muted-foreground">{t(busy ? 'state.loading' : dirty ? 'state.unsaved' : 'state.saved')}</span>{record && <><AnalysisButton record={record} disabled={busy || dirty} onAnalyze={() => { void analyze() }} /><Button variant="outline" size="sm" onClick={() => { void save() }} disabled={busy || !dirty}><Save aria-hidden />{t('action.save')}</Button><Button size="sm" onClick={() => setConfirming(true)} disabled={busy || dirty || analyzing || record.status === 'confirmed'}><Check aria-hidden />{t('action.confirm')}</Button></>}<Button variant="ghost" size="icon" aria-label={t('action.refresh')} onClick={() => guard(() => { void load(record?.id) })} disabled={busy}><RefreshCw aria-hidden /></Button></div>
        {error && !creating && <div role="alert" className="intake-alert border-b text-destructive">{t(error)}{!record && <Button variant="outline" onClick={() => { void load() }} disabled={busy}>{t('action.retry')}</Button>}</div>}
        {!record ? <div className="intake-empty text-muted-foreground"><ClipboardCheck className="size-10" aria-hidden /><p>{t(busy ? 'state.loading' : 'detail.empty')}</p><Button variant="outline" onClick={startCreate} disabled={busy}>{t('action.create')}</Button></div> : <>
          <div className="intake-editor">
            <section className="intake-source">
              <h2 className="font-semibold">{t('detail.original')}</h2><p className="text-xs text-muted-foreground">{t('detail.originalHint')}</p>
              <blockquote className="intake-original rounded-md border bg-muted/30 text-sm">{record.originalFeedback}</blockquote>
              <Label htmlFor="supplement">{t('detail.supplement')}</Label><p className="text-xs text-muted-foreground">{t('detail.supplementHint')}</p>
              <Textarea id="supplement" rows={8} maxLength={20000} value={supplement} disabled={busy} onChange={event => setSupplement(event.target.value)} />
              <AnalysisPanel record={record} answers={answers} disabled={busy || analyzing} setAnswer={(id, text) => setAnswers(previous => ({ ...previous, [id]: text }))} />
              <p className="text-xs text-muted-foreground">{t('state.savedAt', { date: i18n.date(record.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
              {record.confirmed && <section className="intake-snapshot rounded-md border bg-muted/30"><h3 className="text-sm font-semibold">{t('detail.snapshot')}</h3><p className="text-xs text-muted-foreground">{t('detail.snapshotHint')}</p><p className="text-sm font-medium">{record.confirmed.report.title}</p><p className="text-sm whitespace-pre-wrap">{record.confirmed.report.actual}</p><p className="text-xs text-muted-foreground">{i18n.date(record.confirmed.confirmedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p><Button variant="outline" size="sm" onClick={() => setShowSnapshot(true)}>{t('detail.snapshot')}</Button></section>}
            </section>
            <section className="intake-report"><div className="intake-report-title"><h2 className="font-semibold">{t('detail.report')}</h2><Badge variant={record.status === 'confirmed' && !dirty ? 'default' : 'outline'}>{t(dirty ? 'state.draft' : `state.${record.status}`)}</Badge></div><p className="text-xs text-muted-foreground">{t('detail.reportHint')}</p>
              <div className="intake-fields">{reportKeys.map(key => <div key={key} className={`intake-field ${['title', 'steps', 'expected', 'actual', 'questions'].includes(key) ? 'wide' : ''}`}><Label htmlFor={`report-${key}`}>{t(`field.${key}`)}</Label>{key === 'title' ? <Input id={`report-${key}`} maxLength={200} value={report[key]} disabled={busy} onChange={event => setReport({ ...report, [key]: event.target.value })} /> : <Textarea id={`report-${key}`} rows={['steps', 'actual', 'questions'].includes(key) ? 3 : 2} maxLength={8000} placeholder={t('field.unknown')} value={report[key]} disabled={busy} onChange={event => setReport({ ...report, [key]: event.target.value })} />}<FieldEvidence record={record} field={key} value={report[key]} /></div>)}</div>
            </section>
          </div>

        </>}
      </section>
    </div>
    <Dialog open={creating} onOpenChange={open => { if (!busy) setCreating(open) }}><DialogContent><DialogHeader><DialogTitle>{t('create.title')}</DialogTitle><DialogDescription>{t('create.hint')}</DialogDescription></DialogHeader><Label htmlFor="original-feedback">{t('create.label')}</Label><Textarea id="original-feedback" rows={7} maxLength={20000} placeholder={t('create.placeholder')} value={feedback} onChange={event => { setFeedback(event.target.value); setCreateId(crypto.randomUUID()) }} disabled={busy} />{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCreating(false)}>{t('action.cancel')}</Button><Button disabled={busy} onClick={() => { void create() }}>{t('create.submit')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!deferred} onOpenChange={open => { if (!open) setDeferred(null) }}><DialogContent><DialogHeader><DialogTitle>{t('discard.title')}</DialogTitle><DialogDescription>{t('discard.hint')}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeferred(null)}>{t('action.continue')}</Button><Button onClick={() => { const action = deferred; setDeferred(null); action?.() }}>{t('action.discard')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={showSnapshot} onOpenChange={setShowSnapshot}><DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>{t('detail.snapshot')}</DialogTitle><DialogDescription>{t('detail.snapshotHint')}</DialogDescription></DialogHeader>{record?.confirmed && <><dl className="intake-snapshot-fields">{reportKeys.map(key => <div key={key}><dt className="text-sm font-medium">{t(`field.${key}`)}</dt><dd className="text-sm whitespace-pre-wrap text-muted-foreground">{record.confirmed?.report[key] || t('field.unknown')}</dd></div>)}</dl><Label>{t('detail.supplement')}</Label><p className="text-sm whitespace-pre-wrap">{record.confirmed.supplement || t('field.unknown')}</p></>}</DialogContent></Dialog>
    <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent><DialogHeader><DialogTitle>{t('confirm.title')}</DialogTitle><DialogDescription>{t('confirm.hint')}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>{t('action.cancel')}</Button><Button disabled={busy} onClick={() => { void confirm() }}>{t('action.confirm')}</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
