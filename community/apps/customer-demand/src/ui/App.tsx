import React, { useEffect, useRef, useState } from 'react'
import { Plus, RefreshCw, ArrowRight, ChevronLeft, ChevronRight, CircleCheck, FileText, Sparkles, AlertCircle, Pencil, Search } from 'lucide-react'
import { Button } from './components/ui/button.js'
import { Input } from './components/ui/input.js'
import { Textarea } from './components/ui/textarea.js'
import { Badge } from './components/ui/badge.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.js'
import { categories, priorities, nextSteps, statuses, type Category, type Priority, type NextStep, type Demand, type Page } from '../domain.js'
import { connect, gateway } from './bridge.js'
import { i18n, type Locale, type MessageKey } from './i18n.js'

type Copy = ReturnType<typeof i18n>
const blank = { customer: '', title: '', source: '' }
const emptyPage: Page = { records: [], selected: null, total: 0, page: 1, pageSize: 12 }

function Picker<T extends string>({ label, value, values, onChange, copy, disabled }: {
 label: string; value: T; values: readonly T[]; onChange: (v: T) => void; copy: Copy; disabled?: boolean
}) {
 return <label className="grid gap-2 text-sm"><span>{label}</span><Select disabled={disabled} value={value} onValueChange={next => { const v = values.find(v => v === next); if (v) onChange(v) }}>
  <SelectTrigger aria-label={label} className="w-full"><SelectValue /></SelectTrigger>
  <SelectContent>{values.map(v => <SelectItem key={v} value={v}>{copy.t(v as MessageKey)}</SelectItem>)}</SelectContent>
 </Select></label>
}

function IntakeForm({ copy, busy, initial = blank, editing, onSave, onCancel }: {
 copy: Copy; busy: boolean; initial?: typeof blank; editing?: boolean;
 onSave: (fields: typeof blank) => Promise<void>; onCancel: () => void
}) {
 const [fields, setFields] = useState({ customer: initial.customer, title: initial.title, source: initial.source })
 const { t } = copy
 return <form className="mx-auto grid w-full max-w-3xl gap-6 p-6 lg:p-10" onSubmit={e => { e.preventDefault(); void onSave(fields) }}>
  <div className="border-b pb-5"><h2 className="text-xl font-semibold">{t(editing ? 'edit' : 'new')}</h2><p className="mt-2 text-sm text-muted-foreground">{t(editing ? 'editHint' : 'sourceHint')}</p></div>
  <div className="grid gap-5 sm:grid-cols-2">
   <label className="grid gap-2 text-sm">{t('customer')}<Input required maxLength={100} value={fields.customer} disabled={busy} onChange={e => setFields({ ...fields, customer: e.target.value })} /></label>
   <label className="grid gap-2 text-sm">{t('demandTitle')}<Input required maxLength={160} value={fields.title} disabled={busy} onChange={e => setFields({ ...fields, title: e.target.value })} /></label>
  </div>
  <label className="grid gap-2 text-sm">{t('source')}<Textarea required minLength={10} maxLength={12000} rows={12} className="min-h-64 leading-7" value={fields.source} disabled={busy} onChange={e => setFields({ ...fields, source: e.target.value })} /></label>
  <div className="flex gap-3"><Button disabled={busy} type="submit">{t(busy ? 'working' : editing ? 'saveEdit' : 'save')}<ArrowRight size={16} /></Button><Button disabled={busy} variant="outline" type="button" onClick={onCancel}>{t('cancel')}</Button></div>
 </form>
}

function Detail({ record, copy, busy, onEvaluate, onEdit, onConfirm }: {
 record: Demand; copy: Copy; busy: boolean; onEvaluate: () => void; onEdit: () => void;
 onConfirm: (input: { revision: number; category: Category; priority: Priority; nextStep: NextStep; note: string }) => void
}) {
 const { t } = copy
 const a = record.assessment
 const [category, setCategory] = useState<Category>(record.decision?.category ?? a?.category ?? 'unclear')
 const [priority, setPriority] = useState<Priority>(record.decision?.priority ?? a?.priority ?? 'normal')
 const [nextStep, setNextStep] = useState<NextStep>(record.decision?.nextStep ?? a?.nextStep ?? 'clarify')
 const [note, setNote] = useState(record.decision?.note ?? '')
 return <div className="p-5 lg:p-8">
  <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
   <div className="min-w-0"><div className="mb-2 flex items-center gap-3 text-sm text-muted-foreground"><span>{record.customer}</span><Badge variant="secondary">{t(record.status)}</Badge></div>
    <h2 className="break-words text-2xl font-semibold tracking-tight">{record.title}</h2><p className="mt-2 text-xs text-muted-foreground">{t('updated', { date: copy.date(record.updatedAt) })}</p>
   </div>
   <Button variant="outline" size="sm" disabled={busy || record.status === 'evaluating'} onClick={onEdit}><Pencil size={14}/>{t('edit')}</Button>
  </header>
  <div className="grid gap-8 py-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
   <section className="min-w-0"><h3 className="flex items-center gap-2 border-b pb-3 font-medium"><FileText size={17}/>{t('source')}</h3>
    <div className="mt-4 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-5 text-sm leading-7">{record.source}</div>
    {a && <div className="mt-6"><h3 className="mb-4 font-medium">{t('completeness')}</h3><div className="grid gap-3 sm:grid-cols-2">
     {(['goal', 'budget', 'timeline', 'decisionMaker'] as const).map(key => {
      const value = a.completeness[key]
      return <div key={key} className="rounded-md border p-3"><div className="flex justify-between gap-3 text-sm"><span>{t(key)}</span><strong>{copy.percent(value)}</strong></div>
       <div className="my-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary/60" style={{ width: `${value * 100}%` }}/></div>
       <p className="text-xs text-muted-foreground">{t(value >= 0.8 ? 'known' : value <= 0.2 ? 'missing' : 'uncertain')}</p>
      </div>
     })}</div><p className="mt-3 text-xs text-muted-foreground">{t('probabilityHint')}</p></div>}
   </section>
   <div className="min-w-0 space-y-7">
    <section><h3 className="flex items-center gap-2 border-b pb-3 font-medium"><Sparkles size={17}/>{t('aiTitle')}</h3>
     {!a && <div className="mt-4 grid gap-4 rounded-md border border-dashed p-5">
      <p className="text-sm text-muted-foreground">{t(record.status === 'failed' ? 'failedHint' : record.status === 'evaluating' ? 'runningHint' : 'awaiting')}</p>
      {record.errorCode && <p className="text-sm text-destructive" role="alert">{copy.error(record.errorCode)}</p>}
      <Button disabled={busy} onClick={onEvaluate}><Sparkles size={16}/>{t(busy ? 'working' : record.status === 'draft' ? 'evaluate' : 'retry')}</Button>
     </div>}
     {a && <div className="mt-4 space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm"><dt className="text-muted-foreground">{t('category')}</dt><dd className="font-medium">{t(a.category)}</dd>
       <dt className="text-muted-foreground">{t('priority')}</dt><dd className="font-medium">{t(a.priority)}</dd>
       <dt className="text-muted-foreground">{t('nextStep')}</dt><dd className="font-medium">{t(a.nextStep)}</dd></dl>
      {a.reviewRequired && <p className="rounded-md bg-muted p-3 text-sm">{t('uncertainHint')}</p>}
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">{t('modelDetails')}</summary>
       <dl className="mt-2 grid grid-cols-2 gap-2"><dt>{t('model')}</dt><dd>{a.model}</dd><dt>{t('confidence')}</dt><dd>{copy.percent(a.categoryConfidence)}</dd>
        <dt>{t('nextConfidence')}</dt><dd>{copy.percent(a.nextStepConfidence)}</dd><dt>{t('urgency')}</dt><dd>{a.urgency.toFixed(2)}</dd>
        <dt>{t('attempts')}</dt><dd>{record.attempts.length}</dd></dl>
       <p className="mt-3 leading-5">{t('policy')}</p>
       <ul className="mt-3 space-y-2">{record.attempts.map(attempt => <li key={attempt.id}>{copy.date(attempt.startedAt)} · {t(attempt.status === 'succeeded' ? 'attemptSucceeded' : attempt.status === 'failed' ? 'attemptFailed' : 'attemptRunning')}{attempt.errorCode && ` · ${copy.error(attempt.errorCode)}`}</li>)}</ul>
      </details>
     </div>}
    </section>
    {a && <section><h3 className="flex items-center gap-2 border-b pb-3 font-medium"><CircleCheck size={17}/>{t('humanTitle')}</h3><p className="my-4 text-sm leading-6 text-muted-foreground">{t('humanHint')}</p>
     <form className="grid gap-4" onSubmit={e => { e.preventDefault(); onConfirm({ revision: record.revision, category, priority, nextStep, note }) }}>
      <div className="grid gap-4 sm:grid-cols-2"><Picker copy={copy} label={t('category')} value={category} values={categories} onChange={setCategory} disabled={busy}/><Picker copy={copy} label={t('priority')} value={priority} values={priorities} onChange={setPriority} disabled={busy}/></div>
      <Picker copy={copy} label={t('nextStep')} value={nextStep} values={nextSteps} onChange={setNextStep} disabled={busy}/>
      <label className="grid gap-2 text-sm">{t('note')}<Textarea required maxLength={2000} rows={3} placeholder={t('noteHint')} value={note} onChange={e => setNote(e.target.value)} disabled={busy}/></label>
      <Button type="submit" disabled={busy}><CircleCheck size={16}/>{t(busy ? 'working' : record.decision ? 'updateDecision' : 'confirm')}</Button>
      {record.decision && <p className="text-xs text-muted-foreground">{t('decisionTime', { date: copy.date(record.decision.confirmedAt) })}</p>}
     </form>
    </section>}
   </div>
  </div>
 </div>
}

export function App() {
 const [locale, setLocale] = useState<Locale>('zh-Hans')
 const copy = i18n(locale); const { t } = copy
 const [ready, setReady] = useState(false); const [data, setData] = useState<Page>(emptyPage)
 const [selection, setSelection] = useState<string>(); const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all')
 const [page, setPage] = useState(1); const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
 const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState<MessageKey | ''>('')
 const requestId = useRef(crypto.randomUUID()); const generation = useRef(0); const busyRef = useRef(false)
 const live = useRef({ selection, search, filter, page }); live.current = { selection, search, filter, page }

 async function reload(id = live.current.selection) {
  const current = ++generation.current; const q = live.current
  try {
   const next = await gateway.list({ page: q.page, pageSize: 12, search: q.search, selectionId: id, parameters: q.filter === 'all' ? undefined : { status: q.filter } })
   if (current === generation.current) { setData(next); setError('') }
  } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'operation_failed') }
 }
 useEffect(() => connect((nextLocale, selected) => { setLocale(nextLocale); setSelection(selected); setReady(true) }, () => { if (!busyRef.current) void reload() }), [])
 useEffect(() => { if (!ready) return; const timer = setTimeout(() => void reload(selection), 180); return () => clearTimeout(timer) }, [ready, selection, page, search, filter])

 async function mutate(action: 'create' | 'edit' | 'evaluate' | 'confirm', fields: object = {}) {
  if (busyRef.current) return
  busyRef.current = true; setBusy(true); setError(''); setNotice('')
  try {
   const result = await gateway.action(action, selection, fields)
   setSelection(result.id); setMode('list')
   if (action === 'create') requestId.current = crypto.randomUUID()
   await reload(result.id)
   setNotice(result.status === 'failed' ? '' : action === 'evaluate' ? 'assessmentDone' : action === 'confirm' ? 'confirmed' : 'sourceSaved')
  } catch (e) { setError(e instanceof Error ? e.message : 'operation_failed') }
  finally { busyRef.current = false; setBusy(false) }
 }
 const record = data.selected
 return <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
  <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-5 lg:px-8">
   <div><h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p></div>
   <div className="flex gap-2"><Button variant="outline" size="icon" aria-label={t('refresh')} disabled={!ready || busy} onClick={() => void reload()}><RefreshCw size={16}/></Button>
    <Button disabled={!ready || busy} onClick={() => { setMode('create'); requestId.current = crypto.randomUUID(); setNotice(''); setError('') }}><Plus size={16}/>{t('new')}</Button></div>
  </header>
  {error && <div role="alert" className="flex items-center gap-2 border-b bg-destructive/5 px-6 py-3 text-sm text-destructive"><AlertCircle size={16}/>{copy.error(error)}</div>}
  {notice && <div role="status" className="border-b bg-muted/40 px-6 py-2 text-sm">{t(notice)}</div>}
  {!ready ? <div className="p-10 text-muted-foreground">{t('loading')}</div> : <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[290px_minmax(0,1fr)]">
   <aside className={`min-h-0 min-w-0 flex-col border-r ${mode !== 'list' || selection ? 'hidden md:flex' : 'flex'}`}>
    <div className="grid gap-3 border-b p-4"><div className="relative"><Search size={15} className="absolute left-3 top-3 text-muted-foreground"/><Input className="pl-9" aria-label={t('search')} placeholder={t('search')} value={search} disabled={busy} onChange={e => { setSearch(e.target.value); setPage(1) }}/></div>
     <Select value={filter} onValueChange={v => { setFilter(v); setPage(1) }} disabled={busy}><SelectTrigger className="w-full" aria-label={t('all')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{statuses.map(status => <SelectItem value={status} key={status}>{t(status)}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">{data.records.map(row => <button key={row.id} disabled={busy} aria-pressed={selection === row.id} onClick={() => { setSelection(row.id); setMode('list'); setNotice('') }} className={`mb-1 w-full rounded-md border p-3 text-left transition-colors hover:bg-muted ${selection === row.id && mode === 'list' ? 'border-primary/35 bg-muted' : 'border-transparent'}`}>
     <span className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{row.customer}</span><Badge variant="outline">{t(row.status)}</Badge></span>
     <strong className="block break-words text-sm font-medium">{row.title}</strong><span className="mt-2 block text-xs text-muted-foreground">{copy.date(row.updatedAt)}</span>
    </button>)}{!data.records.length && <p className="p-4 text-sm text-muted-foreground">{t('empty')}</p>}</div>
    <footer className="border-t p-3"><p className="mb-2 text-xs text-muted-foreground">{t('records', { total: data.total, page: data.page })}</p><div className="flex justify-between"><Button size="sm" variant="ghost" disabled={busy || page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14}/>{t('previous')}</Button><Button size="sm" variant="ghost" disabled={busy || page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>{t('next')}<ChevronRight size={14}/></Button></div></footer>
   </aside>
   <div className={`min-h-0 min-w-0 overflow-y-auto ${!selection && mode === 'list' ? 'hidden md:block' : ''}`} aria-busy={busy}>
    {(selection || mode !== 'list') && <Button className="m-3 md:hidden" size="sm" variant="ghost" disabled={busy} onClick={() => { setSelection(undefined); setMode('list') }}><ChevronLeft size={14}/>{t('all')}</Button>}
    {mode === 'create' ? <IntakeForm key={requestId.current} copy={copy} busy={busy} onCancel={() => setMode('list')} onSave={fields => mutate('create', { ...fields, requestId: requestId.current })}/>
     : mode === 'edit' && record ? <IntakeForm key={record.id} copy={copy} busy={busy} editing initial={record} onCancel={() => setMode('list')} onSave={fields => mutate('edit', { ...fields, revision: record.revision })}/>
     : record ? <Detail key={`${record.id}:${record.revision}`} record={record} copy={copy} busy={busy} onEdit={() => setMode('edit')} onEvaluate={() => void mutate('evaluate')} onConfirm={fields => void mutate('confirm', fields)}/>
     : <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><FileText size={32} className="text-muted-foreground"/><h2 className="text-lg font-medium">{t(data.total ? 'choose' : 'empty')}</h2><p className="max-w-sm text-sm leading-6 text-muted-foreground">{t(data.total ? 'chooseHint' : 'emptyHint')}</p></div>}
   </div>
  </div>}
 </main>
}
