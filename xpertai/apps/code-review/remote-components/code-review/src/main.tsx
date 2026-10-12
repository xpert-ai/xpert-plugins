import { AutomationDashboard } from './automation-dashboard'
import { i18n, errorMessage } from './i18n'
import { ASSISTANT_CONTEXT_SET_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND, WORKBENCH_EXTENSION_VIEW_TARGET, WORKBENCH_ASSISTANT_CONVERSATION_TARGET } from '@xpert-ai/contracts'
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { GitPullRequest, Pin, RefreshCw, Search, Play, Square, ExternalLink, FileCode2, Check, ChevronLeft, ChevronRight, LoaderCircle, MessageSquare, ArrowLeft } from 'lucide-react'
import { Button, Input, Textarea, Badge, Checkbox, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/plugin-shadcn-ui'
import { connect, data, action, command, type Host } from './bridge'
import { refSchema, snapshotSchema, findingSchema, diffLines } from '../../../src/domain'

const reviewSchema = z.object({ id: z.string(), revision: z.number(), ref: refSchema, snapshot: snapshotSchema, status: z.string(), access: z.enum(['public', 'connected']),
  conversationId: z.string().nullish(), executionId: z.string().nullish(), automationRunId: z.string().nullish(), pinned: z.boolean(), viewed: z.array(z.string()), summary: z.string(), findings: z.array(findingSchema), errorCode: z.string().nullable(), submissionUrl: z.string().nullable() })
type Review = z.infer<typeof reviewSchema>
const savedSchema = z.object({ id: z.string(), ref: refSchema, status: z.string(), pinned: z.boolean() })
const inboxSchema = z.object({ number: z.number(), title: z.string(), url: z.string(), author: z.string() })
type Saved = z.infer<typeof savedSchema>
type Inbox = z.infer<typeof inboxSchema>

function App() {
  const [host, setHost] = useState<Host | null>(null), [list, setList] = useState<Saved[]>([]), [inbox, setInbox] = useState<Inbox[]>([])
  const [filter, setFilter] = useState('recent'), [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const [review, setReview] = useState<Review | null>(null), [path, setPath] = useState(''), [tab, setTab] = useState('summary')
  const [url, setUrl] = useState(''), [access, setAccess] = useState<'public' | 'connected'>('public'), [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [submitOpen, setSubmitOpen] = useState(false)
  const [body, setBody] = useState(''), [event, setEvent] = useState('COMMENT'), [selected, setSelected] = useState<number[]>([])
  const epoch = useRef(0), detailEpoch = useRef(0), listEpoch = useRef(0), initialized = useRef(false), refreshRef = useRef(() => {})
  const { t, locale } = i18n(host?.locale)
  const message = (code: string) => errorMessage(code, locale)
  useEffect(() => connect(h => {
    epoch.current++; setHost(h); setError(''); setBusy(false)
    const q = h.initialQuery
    if (q?.selectionId) void loadDetail(q.selectionId)
    else {
      detailEpoch.current++; setReview(null); setPath(''); setSubmitOpen(false)
      void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', clear: true }).catch(() => {})
    }
    if (q?.parameters?.tab && ['summary', 'changes', 'findings', 'checks'].includes(String(q.parameters.tab))) setTab(String(q.parameters.tab))
    if (!initialized.current) { initialized.current = true; if (!q?.parameters?.tab) setTab('changes') }
  }, () => refreshRef.current()), [])
  async function publishSelection(r: Review) {
    await command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', context: { reviewId: r.id, headSha: r.snapshot.headSha } })
  }
  async function ask(finding: Review['findings'][number]) {
    if (!review) return
    try { await publishSelection(review); await command(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, { text: t('askFinding', { title: finding.title, path: finding.path, line: finding.line }) }) }
    catch (e) { setError(e instanceof Error ? e.message : 'operation_failed') }
  }
  async function openProcess() {
    if (!review?.conversationId) return
    const generation = epoch.current; setError('')
    try {
      await command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
        conversationId: review.conversationId, ...(review.executionId ? { executionId: review.executionId } : {}) })
    } catch (error) {
      // Successful conversation navigation replaces the bridge scope and cancels its pending reply.
      if (generation === epoch.current && (!(error instanceof Error) || error.message !== 'context_changed'))
        setError(error instanceof Error ? error.message : 'command_unavailable')
    }
  }
  async function selectReview(id: string) {
    await loadDetail(id)
    if (host) await command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey: host.manifest.key, selectionId: id, parameters: { tab: 'changes' } }).catch(e => setError(e instanceof Error ? e.message : 'command_unavailable'))
  }
  refreshRef.current = () => { void loadList(); if (review) void loadDetail(review.id) }

  async function loadList() {
    if (!host) return
    const generation = epoch.current, request = ++listEpoch.current
    try {
      const result = await data({ page, ...(filter === 'recent' ? {} : { parameters: { inbox: filter } }) })
      if (generation !== epoch.current || request !== listEpoch.current) return
      if (filter === 'recent') { const value = z.object({ items: z.array(savedSchema), total: z.number() }).parse(result); setList(value.items); setTotal(value.total) }
      else { const value = z.object({ items: z.array(inboxSchema), total: z.number() }).parse(result); setInbox(value.items); setTotal(value.total) }
    } catch (e) { if (generation === epoch.current) setError(e instanceof Error ? e.message : 'operation_failed') }
  }
  useEffect(() => { void loadList() }, [host, page, filter])
  async function loadDetail(id: string) {
    const generation = epoch.current, selection = ++detailEpoch.current
    try {
      const response = z.object({ meta: z.object({ detail: reviewSchema }) }).parse(await data({ selectionId: id }))
      if (generation !== epoch.current || selection !== detailEpoch.current) return
      setReview(response.meta.detail)
      void publishSelection(response.meta.detail).catch(e => setError(e instanceof Error ? e.message : 'command_unavailable'))
      setPath(current => response.meta.detail.snapshot.files.some(f => f.filename === current) ? current : response.meta.detail.snapshot.files[0]?.filename ?? '')
    } catch (e) { if (generation === epoch.current) setError(e instanceof Error ? e.message : 'operation_failed') }
  }
  useEffect(() => {
    if (review?.status !== 'running') return
    const timer = setInterval(() => { void loadDetail(review.id) }, 4000)
    return () => clearInterval(timer)
  }, [review?.id, review?.status, host])
  async function execute(key: string, input: Record<string, unknown>) {
    const generation = epoch.current; setBusy(true); setError('')
    try {
      const value = reviewSchema.parse(await action(key, input))
      if (generation !== epoch.current) return
      detailEpoch.current++; setReview(value); void publishSelection(value).catch(e => setError(e instanceof Error ? e.message : 'command_unavailable')); setPath(current => value.snapshot.files.some(f => f.filename === current) ? current : value.snapshot.files[0]?.filename ?? '')
      if (key === 'open' && host) await command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey: host.manifest.key, selectionId: value.id, parameters: { tab: 'changes' } })
      await loadList(); if (key === 'submit') setSubmitOpen(false)
    } catch (e) { if (generation === epoch.current) setError(e instanceof Error ? e.message : 'operation_failed') }
    finally { if (generation === epoch.current) setBusy(false) }
  }
  const act = (key: string, input: Record<string, unknown> = {}) => review && execute(key, { id: review.id, revision: review.revision, ...input })
  const frozen = review && ['running', 'submitting', 'submission_unknown'].includes(review.status)
  const file = review?.snapshot.files.find(f => f.filename === path)
  const status = (value: string) => ({ ready: t('ready'), running: t('reviewing'), reviewed: t('draftReady'), failed: t('failed'), cancelled: t('cancelled'), submitting: t('submitting'), submitted: t('submitted'), submission_unknown: t('checkGithub') }[value] ?? value)
  if (!review) return <AutomationDashboard host={host} busy={busy} saved={list} error={error} onOpen={(url, access) => void execute('open', { url, access })} onSelect={id => void selectReview(id)}/>
  return <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
    {!review && <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div className="flex items-center gap-3"><GitPullRequest className="size-5"/><div><h1 className="font-semibold">{t('codeReview')}</h1><p className="text-xs text-muted-foreground">{t('readTheChangeVerifyTheFinding')}</p></div></div>
      <Button variant="ghost" size="icon" aria-label={t('reload')} disabled={busy || !host} onClick={() => { void loadList() }}><RefreshCw className="size-4"/></Button>
    </header>}
    {!review && <form className="flex flex-wrap gap-2 border-b px-5 py-3" onSubmit={e => { e.preventDefault(); void execute('open', { url, access }) }}>
      <Input className="min-w-52 flex-1" aria-label={t('pullRequestUrl')} placeholder="https://github.com/owner/repo/pull/123" value={url} onChange={e => setUrl(e.target.value)} required type="url"/>
      <Select value={access} onValueChange={v => setAccess(v === 'connected' ? 'connected' : 'public')}><SelectTrigger aria-label={t('githubAccess')} className="w-40"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="public">{t('publicRepository')}</SelectItem><SelectItem value="connected">{t('connectedGithub')}</SelectItem></SelectContent></Select>
      <Button disabled={!host || busy || !url} type="submit">{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Search className="size-4"/>}{t('openPr')}</Button>
    </form>}
    {(error || review?.errorCode) && <div role="alert" className="border-b bg-muted px-5 py-3 text-sm">{message(error || review?.errorCode || '')}</div>}
    <div className={"grid min-h-0 flex-1 " + (review ? "grid-cols-1" : "grid-cols-1 md:grid-cols-[15rem_1fr]")}>
      {!review && <aside className="flex min-h-0 flex-col border-r">
        <div className="p-3"><Select value={filter} onValueChange={v => { setFilter(v); setPage(1); setError('') }}><SelectTrigger aria-label={t('prList')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="recent">{t('recentPinned')}</SelectItem><SelectItem value="requested">{t('reviewRequested')}</SelectItem><SelectItem value="authored">{t('createdByMe')}</SelectItem></SelectContent></Select></div>
        <nav className="min-h-0 flex-1 overflow-auto px-2" aria-label={t('pullRequests')}>
          {filter === 'recent' ? list.map(r => <button key={r.id} className={`mb-1 w-full rounded-lg p-3 text-left hover:bg-accent `} onClick={() => void selectReview(r.id)}><div className="flex items-center gap-2 text-sm font-medium">{r.pinned && <Pin className="size-3"/>}{r.ref.repository} #{r.ref.number}</div><div className="mt-1 text-xs text-muted-foreground">{r.ref.owner} · {status(r.status)}</div></button>) : inbox.map(r => <button key={r.url} className="mb-1 w-full rounded-lg p-3 text-left hover:bg-accent" onClick={() => void execute('open', { url: r.url, access: 'connected' })} disabled={busy}><div className="text-sm font-medium">#{r.number} {r.title}</div><div className="mt-1 text-xs text-muted-foreground">{r.author}</div></button>)}
          {(filter === 'recent' ? list : inbox).length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('noPullRequestsHereYet')}</p>}
        </nav><div className="flex items-center justify-between border-t p-2"><Button variant="ghost" size="icon" disabled={page === 1} aria-label={t('previousPage')} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4"/></Button><span className="text-xs text-muted-foreground">{page} / {Math.max(1, Math.ceil(total / 20))}</span><Button variant="ghost" size="icon" disabled={page * 20 >= total} aria-label={t('nextPage')} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4"/></Button></div>
      </aside>}
      <main className="min-h-0 min-w-0 overflow-auto">
        {!review ? <div className="mx-auto max-w-lg px-8 py-20 text-center"><GitPullRequest className="mx-auto mb-5 size-10 text-muted-foreground"/><h2 className="mb-2 text-xl font-semibold">{t('startWithAPullRequest')}</h2><p className="text-sm leading-6 text-muted-foreground">{t('openAPublicPrAboveOrConnectGithub')}</p></div> : <>
          <section className="border-b px-5 py-4">{review.automationRunId && <p className="mb-3 text-sm text-muted-foreground">{locale.startsWith('zh') ? '自动审查记录：请在收件箱管理发布，在仓库页修改策略。' : 'Automatic review: manage publication in the inbox and rules under Repositories.'}</p>}<Button variant="ghost" size="sm" className="mb-2" onClick={() => { setReview(null); void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', clear: true }); void command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey: host?.manifest.key, parameters: {} }).catch(() => {}) }}><ArrowLeft className="size-4"/>{t('backToList')}</Button><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><span>{review.ref.owner}/{review.ref.repository} #{review.ref.number}</span><Badge variant="secondary">{status(review.status)}</Badge></div><h2 className="text-lg font-semibold">{review.snapshot.title}</h2><div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><code>{review.snapshot.headSha.slice(0, 12)}</code><span>· {review.snapshot.author}</span><a href={review.snapshot.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">GitHub <ExternalLink className="size-3"/></a></div>
          <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || !!frozen || !!review.automationRunId} onClick={() => void act('refresh')}><RefreshCw className="size-3"/>{t('refreshPr')}</Button><Button variant={review.pinned ? 'secondary' : 'outline'} size="sm" disabled={busy} onClick={() => void act('mark', { pinned: !review.pinned })}><Pin className="size-3"/>{t('pin')}</Button>{review.status === 'running' ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void act('cancel')}><Square className="size-3"/>{t('cancelReview')}</Button> : <Button size="sm" disabled={busy || !!frozen || !!review.automationRunId} onClick={() => void act('start', { instructions: focus })}><Play className="size-3"/>{t('reviewChanges')}</Button>}{review.conversationId && <Button size="sm" variant="outline" onClick={() => void openProcess()}>{locale.startsWith('zh') ? '查看审查过程' : 'View review process'}</Button>}<Button size="sm" disabled={busy || review.status !== 'reviewed' || !!review.automationRunId} onClick={() => { setBody(review.summary); setSelected(review.findings.map((_, i) => i)); setSubmitOpen(true) }}>{t('submitReview')}</Button></div>
          </section>
          <nav className="flex gap-1 border-b px-4" aria-label={t('reviewSections')}>{['summary', 'changes', 'findings', 'checks'].map((key, i) => <Button key={key} variant={tab === key ? 'secondary' : 'ghost'} size="sm" className="my-2" aria-pressed={tab === key} onClick={() => { setTab(key); void command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey: host?.manifest.key, selectionId: review.id, parameters: { tab: key } }).catch(e => setError(e instanceof Error ? e.message : 'command_unavailable')) }}>{[t('overview'), t('changes'), `${t('findings')} (${review.findings.length})`, t('checks')][i]}</Button>)}</nav>
          {tab === 'summary' && <div className="space-y-5 p-5"><label className="block text-sm font-medium">{t('reviewFocusOptional')}<Textarea className="mt-2" value={focus} onChange={e => setFocus(e.target.value)} maxLength={6000} placeholder={t('forExampleConcurrencyAndAuthorization')}/></label>{review.snapshot.warnings.length > 0 && <div className="rounded-lg border p-3 text-sm">{t('coverageLimitations')}<ul className="mt-2 list-inside list-disc text-muted-foreground">{review.snapshot.warnings.map(w => <li key={w}>{({ files_truncated: t('fileListIsIncomplete'), diff_unavailable_for_some_files: t('someFilesHaveNoDiffBinaryOrToo'), checks_unavailable: t('checksAreUnavailable'), comments_truncated: t('onlyTheFirstCommentsAreIncluded'), checks_truncated: t('checkListIsIncomplete') })[w] ?? w}</li>)}</ul></div>}<section><h3 className="mb-2 text-sm font-medium">{t('reviewSummary')}</h3><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.summary || t('startAReviewToGenerateADraftWith')}</p></section><section><h3 className="mb-2 text-sm font-medium">{t('prDescription')}</h3><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.snapshot.body || t('noDescription')}</p></section>{review.submissionUrl && <a className="text-sm underline" href={review.submissionUrl} target="_blank" rel="noreferrer">{t('viewSubmittedReview')}</a>}</div>}
          {tab === 'changes' && <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[11rem_minmax(0,1fr)]"><aside className="hidden border-r p-2 lg:block"><p className="p-2 text-sm font-medium">{t('changedFiles')}</p>{review.snapshot.files.map(f => <Button key={f.filename} variant={path === f.filename ? 'secondary' : 'ghost'} className="mb-1 h-auto w-full justify-start whitespace-normal py-3 text-left text-xs" onClick={() => setPath(f.filename)}><FileCode2 className="size-4 shrink-0"/><span className="min-w-0 break-all">{f.filename}</span>{review.viewed.includes(f.filename) && <Check className="size-3 shrink-0"/>}</Button>)}</aside><div className="min-w-0 p-4"><div className="mb-3 flex flex-wrap items-center gap-3"><Select value={path} onValueChange={setPath}><SelectTrigger className="min-w-52 flex-1" aria-label={t('changedFile')}><SelectValue/></SelectTrigger><SelectContent>{review.snapshot.files.map(f => <SelectItem key={f.filename} value={f.filename}>{review.viewed.includes(f.filename) ? '✓ ' : ''}{f.filename}</SelectItem>)}</SelectContent></Select>{file && <label className="flex items-center gap-2 text-sm"><Checkbox checked={review.viewed.includes(path)} disabled={busy} onCheckedChange={value => void act('mark', { viewed: value ? [...new Set([...review.viewed, path])] : review.viewed.filter(p => p !== path) })}/>{t('viewed')}</label>}</div>{file && <><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><FileCode2 className="size-4"/>{file.filename} <span>+{file.additions} −{file.deletions}</span></div><div className="overflow-auto rounded-lg border font-mono text-xs"><table className="w-full border-collapse"><tbody>{file.patch ? diffLines(file.patch).map((line, i) => <React.Fragment key={i}><tr className={line.kind === 'added' ? 'diff-added' : line.kind === 'removed' ? 'diff-removed' : ''}><td className="w-10 select-none border-r px-2 text-right text-muted-foreground">{line.left}</td><td className="w-10 select-none border-r px-2 text-right text-muted-foreground">{line.right}</td><td className="whitespace-pre px-3 py-0.5">{line.text}</td></tr>{review.findings.filter(f => f.path === path && (f.side === 'RIGHT' ? line.right : line.left) === f.line).map((f, j) => <tr key={j}><td colSpan={3} className="px-4 py-3 font-sans"><article className="rounded-lg border border-border bg-muted/60 p-4"><div className="flex items-center gap-2 font-medium"><Badge variant="outline">{f.priority}</Badge>{f.title}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{f.body}</p><Button variant="ghost" size="sm" onClick={() => void ask(f)}><MessageSquare className="size-4"/>{t('askInChat')}</Button></article></td></tr>)}</React.Fragment>) : <tr><td className="p-4">{t('diffUnavailableOpenGithubToInspectThisFile')}</td></tr>}</tbody></table></div></>}</div></div>}
          {tab === 'findings' && <div className="space-y-3 p-5">{review.findings.length === 0 && <p className="text-sm text-muted-foreground">{review.status === 'reviewed' ? t('noSupportedBugsWereFoundInTheReviewed') : t('findingsWillAppearAfterTheReview')}</p>}{review.findings.map((f, i) => <article key={i} className="rounded-xl border p-4"><div className="flex items-center gap-2"><Badge variant="outline">{f.priority}</Badge><h3 className="text-sm font-semibold">{f.title}</h3></div><button className="my-2 text-left font-mono text-xs text-muted-foreground underline" onClick={() => { setPath(f.path); setTab('changes') }}>{f.path}:{f.line} ({f.side})</button><p className="whitespace-pre-wrap text-sm leading-6">{f.body}</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => void ask(f)}><MessageSquare className="size-4"/>{t('askInChat')}</Button></article>)}</div>}
          {tab === 'checks' && <div className="space-y-3 p-5">{review.snapshot.checks.length === 0 && <p className="text-sm text-muted-foreground">{t('noCheckRunsReturnedByGithub')}</p>}{review.snapshot.checks.map(c => <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm">{c.name}</span><Badge variant="secondary">{c.conclusion || c.status}</Badge></div>)}</div>}
        </>}
      </main>
    </div>
    <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}><AlertDialogContent className="max-h-[90vh] overflow-auto"><AlertDialogHeader><AlertDialogTitle>{t('submitToGithub')}</AlertDialogTitle><AlertDialogDescription>{t('thisSendsAReviewFromYourConnectedGithub')}</AlertDialogDescription></AlertDialogHeader><label className="text-sm">{t('reviewDecision')}<Select value={event} onValueChange={setEvent}><SelectTrigger className="mt-2"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="COMMENT">{t('comment')}</SelectItem><SelectItem value="APPROVE">{t('approve')}</SelectItem><SelectItem value="REQUEST_CHANGES">{t('requestChanges')}</SelectItem></SelectContent></Select></label><label className="text-sm">{t('reviewMessage')}<Textarea className="mt-2 min-h-32" value={body} onChange={e => setBody(e.target.value)} maxLength={12000}/></label>{review?.findings.map((f, i) => <label key={i} className="flex items-start gap-2 text-sm"><Checkbox checked={selected.includes(i)} onCheckedChange={value => setSelected(s => value ? [...s, i] : s.filter(v => v !== i))}/><span>[{f.priority}] {f.title}</span></label>)}<AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setSubmitOpen(false)}>{t('cancel')}</Button><Button disabled={busy || !body.trim()} onClick={() => void act('submit', { confirmed: true, event, body, findings: selected, headSha: review?.snapshot.headSha })}><Check className="size-4"/>{t('confirmSubmission')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
