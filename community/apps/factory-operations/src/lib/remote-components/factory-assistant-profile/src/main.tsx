import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Badge, Button, Progress } from '../../../ui'
import { executeAction, invokeClientCommand, isObject, requestData, requireSuccess, startBridge, unwrap } from '../../factory-operations-center/src/runtime'
import { installShadcnThemeVars } from '../../factory-operations-center/src/theme'
import type { FactoryProfileCase, FactoryProfileData } from '../../../factory-profile.service'
import { profileText, reasonText } from './i18n'
import './styles.css'

installShadcnThemeVars({ density: 'compact' })

type Decision = { case: FactoryProfileCase; action: 'approve_and_continue' | 'reject_recovery_plan'; operationId: string }
function App() {
  const [locale, setLocale] = useState('en-US')
  const [ready, setReady] = useState(false)
  const [viewActive, setViewActive] = useState(true)
  const [attention, setAttention] = useState(false)
  const [page, setPage] = useState(1)
  const [selection, setSelection] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<FactoryProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const submittedReason = useRef<string | null>(null)
  const requestSequence = useRef(0)
  const requestedKey = useRef<string | null>(null)
  const text = profileText(locale)
  const current = data?.item ?? null

  useEffect(() => startBridge((context) => {
    setLocale(context.locale ?? 'en-US')
    const manifest = context.manifest
    setAttention(isObject(manifest) && String(manifest.key).endsWith('factory-assistant-needs-attention'))
    setReady(true)
  }, () => setRefresh((value) => value + 1), setViewActive), [])

  useEffect(() => {
    if (!ready || !viewActive || decision || submitting) return
    const key = JSON.stringify([page, selection, refresh])
    const sequence = ++requestSequence.current
    let requestActive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    if (requestedKey.current === key) {
      timer = setTimeout(() => setRefresh((value) => value + 1), 5_000)
      return () => { requestActive = false; clearTimeout(timer) }
    }
    requestedKey.current = key
    setLoading(true)
    void requestData({ page, ...(selection ? { selectionId: selection } : {}) }).then((response) => {
      if (!requestActive || sequence !== requestSequence.current) return
      const result = unwrap(response)
      if (!isProfileData(result)) throw new Error('Invalid profile data')
      setData(result)
      setError(false)
      timer = setTimeout(() => setRefresh((value) => value + 1), 5_000)
    }).catch(() => { if (requestActive) setError(true) }).finally(() => { if (requestActive) setLoading(false) })
    return () => { requestActive = false; clearTimeout(timer) }
  }, [ready, viewActive, page, selection, refresh, decision, submitting])

  useEffect(() => {
    if (!ready) return
    void invokeClientCommand('assistant.profile.interaction', { busy: !!decision || submitting }).catch(() => undefined)
  }, [ready, decision, submitting])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || decision || submitting) return
      event.preventDefault()
      void invokeClientCommand('assistant.profile.close', {}).catch(() => undefined)
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [decision, submitting])

  function openDecision(item: FactoryProfileCase, action: Decision['action']) {
    submittedReason.current = null
    setReason(action === 'approve_and_continue' ? text.approvalReason : '')
    setActionError(null)
    setDecision({ case: item, action, operationId: `profile-${crypto.randomUUID()}` })
  }
  async function submit() {
    if (!decision || submitting || reason.trim().length < 8) return
    submittedReason.current ??= reason.trim()
    setSubmitting(true)
    setActionError(null)
    try {
      requireSuccess(await executeAction(decision.action, decision.case.id, {
        caseId: decision.case.id, baseRevision: decision.case.revision, operationId: decision.operationId,
        reason: submittedReason.current, changeSummary: decision.action === 'approve_and_continue' ? 'Approve recovery and continue in the background.' : 'Reject the proposed recovery plan.'
      }))
      setDecision(null)
      setRefresh((value) => value + 1)
    } catch (error) { setActionError(error instanceof Error ? error.message : text.decisionFailed) }
    finally { setSubmitting(false) }
  }
  async function retryContinuation(item: FactoryProfileCase) {
    if (!item.continuation || submitting) return
    setSubmitting(true)
    setActionError(null)
    try {
      requireSuccess(await executeAction('retry_continuation', item.id, { caseId: item.id, continuationId: item.continuation.id, baseRevision: item.revision }))
      setRefresh((value) => value + 1)
    } catch (error) { setActionError(error instanceof Error ? error.message : text.decisionFailed) }
    finally { setSubmitting(false) }
  }
  const evidence = current ? [current.triage, ...Object.values(current.findings), current.verification].flatMap((artifact) => artifact?.evidence ?? []) : []
  const handling = current ? current.allowedActions.some((action) => action === 'approve_and_continue' || action === 'reject_recovery_plan')
    ? text.handleApproval
    : current.allowedActions.includes('retry_continuation')
      ? text.handleRetry
      : current.status === 'awaiting_approval' || (current.continuation && ['blocked', 'failed'].includes(current.continuation.status))
        ? text.handleOwner
        : text.handleWorkbench
    : null

  return <main className="min-h-full bg-background text-foreground">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-3 py-1.5">
      {selection ? <Button variant="ghost" size="sm" onClick={() => { setSelection(null); setData(null) }}><ArrowLeft className="size-4" />{text.back}</Button>
        : <h3 className="text-sm font-medium">{attention ? text.attention : text.recent} {data && <span className="ml-1 text-muted-foreground">{data.total}</span>}</h3>}
      <Button variant="ghost" size="icon-sm" aria-label={text.refresh} disabled={loading || submitting} onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="size-4" /></Button>
    </div>
    {error ? <div className="space-y-2 p-3" role="alert"><p className="text-sm">{text.error}</p><Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>{text.retry}</Button></div>
      : !data ? <p className="p-3 text-sm text-muted-foreground" role="status">{text.loading}</p>
      : current ? <div className="space-y-3 p-3">
        <div><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold leading-5">{current.caseKey} · {current.title}</h3><Badge variant="outline" className="px-1.5 py-0 text-[11px] leading-5">{text.severity[current.event.severity]}</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">{current.event.deviceName} · {text.statuses[current.status]} · {text.revision} {current.revision}</p></div>
        <Progress className="h-1.5" value={current.progress.percent} aria-label={text.statuses[current.status]} />
        {current.bindingNeedsRepair && <p className="text-xs leading-5 text-muted-foreground">{text.binding}</p>}
        {current.continuation && <div className="space-y-0.5 border-l-2 border-primary pl-2.5 text-xs leading-5"><p>{text[current.continuation.status]}</p>
          {current.continuation.reasonCode && <p className="text-muted-foreground">{reasonText(current.continuation.reasonCode, text)}</p>}</div>}
        <p className="text-xs leading-5"><span className="text-muted-foreground">{text.nextAction} · </span>{current.nextAction}</p>
        {attention && handling && <section className="space-y-0.5 border-l-2 border-border pl-2.5"><h4 className="text-xs font-medium">{text.handling}</h4><p className="text-xs leading-5 text-muted-foreground">{handling}</p></section>}
        {current.plan && <section><h4 className="mb-1 text-xs font-medium">{text.plan} · {text.planRevision} {current.plan.artifactRevision}</h4>
          <p className="text-xs leading-5">{current.plan.options.find((option) => option.id === 'B')?.description}</p></section>}
        <section><h4 className="mb-1 text-xs font-medium">{text.evidence}</h4><ul className="space-y-1.5 text-xs text-muted-foreground">{evidence.slice(-8).map((item, index) => <li key={`${item.reference}-${index}`}>{item.source.toUpperCase()} · {item.reference}<p className="mt-0.5 leading-5 text-foreground">{item.summary}</p></li>)}</ul></section>
        {current.execution && <section><h4 className="mb-1 text-xs font-medium">{text.execution} · {current.execution.actions.filter((action) => action.status === 'confirmed').length}/{current.execution.actions.length}</h4>
          <p className="text-xs text-muted-foreground">{data.simulation ? text.simulationDetail : text.externalDetail}</p></section>}
        <div className="flex flex-wrap gap-1.5">
          {current.allowedActions.includes('approve_and_continue') && <Button size="sm" onClick={() => openDecision(current, 'approve_and_continue')}>{text.approve}</Button>}
          {current.allowedActions.includes('reject_recovery_plan') && <Button variant="outline" size="sm" onClick={() => openDecision(current, 'reject_recovery_plan')}>{text.reject}</Button>}
          {current.allowedActions.includes('retry_continuation') && <Button variant="outline" size="sm" disabled={submitting} onClick={() => void retryContinuation(current)}>{text.resume}</Button>}
        </div>
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      </div> : data.items.length ? <>
        <ul className="divide-y">{data.items.map((item) => <li key={item.id}><button type="button" className="w-full space-y-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" onClick={() => { setSelection(item.id); setData(null) }}>
          <div className="flex items-center gap-1.5"><span className="text-xs font-medium text-muted-foreground">{item.caseKey}</span><Badge className="px-1.5 py-0 text-[11px] leading-5" variant={item.event.severity === 'critical' ? 'destructive' : 'secondary'}>{text.severity[item.event.severity]}</Badge><span className="ml-auto text-xs text-muted-foreground">{text.statuses[item.status]}</span></div>
          <p className="line-clamp-2 text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.event.deviceName} · {item.progress.percent}%</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{text.latest} · {item.timeline.at(-1)?.title ?? item.nextAction}</p>
          {item.continuation?.reasonCode && <p className="text-xs text-destructive">{reasonText(item.continuation.reasonCode, text)}</p>}
        </button></li>)}</ul>
        <nav aria-label={text.recent} className="flex items-center justify-between border-t px-3 py-1.5"><Button variant="ghost" size="icon-sm" aria-label={text.previous} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><span className="text-xs text-muted-foreground">{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><Button variant="ghost" size="icon-sm" aria-label={text.next} disabled={page * data.pageSize >= data.total || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></nav>
      </> : <div className="space-y-1.5 px-4 py-7 text-center"><p className="text-sm font-medium">{text.empty}</p><p className="text-xs leading-5 text-muted-foreground">{text.emptyDetail}</p></div>}
    <AlertDialog open={!!decision} onOpenChange={(open) => { if (!open && !submitting) setDecision(null) }}>
      <AlertDialogContent size="sm" className="max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-md gap-3 overflow-y-auto p-4" onEscapeKeyDown={(event) => { if (submitting) event.preventDefault() }}>
        <AlertDialogHeader><AlertDialogTitle className="text-base">{decision?.action === 'reject_recovery_plan' ? text.confirmReject : text.confirmApprove}</AlertDialogTitle><AlertDialogDescription className="text-xs leading-5">{text.confirmBody}</AlertDialogDescription></AlertDialogHeader>
        <div className="space-y-2.5 text-xs leading-5">
          <p className="font-medium">{decision?.case.caseKey} · {text.revision} {decision?.case.revision} · {text.planRevision} {decision?.case.plan?.artifactRevision}</p>
          <p>{decision?.case.plan?.options.find((option) => option.id === 'B')?.description}</p>
          <div><h4 className="font-medium">{text.scope}</h4><p className="mt-1 text-muted-foreground">{text.systems}</p></div>
          <div className="border-l-2 border-primary pl-3"><p className="font-medium">{data?.simulation ? text.simulation : text.external}</p><p className="mt-1 text-muted-foreground">{data?.simulation ? text.simulationDetail : text.externalDetail}</p></div>
          <label className="block space-y-1.5"><span>{text.reason}</span><textarea className="min-h-16 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={reason} maxLength={500} disabled={submitting || submittedReason.current !== null} onChange={(event) => setReason(event.target.value)} /><span className="block text-xs text-muted-foreground">{text.reasonHelp}</span></label>
          {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
        </div>
        <AlertDialogFooter className="gap-1.5"><Button variant="outline" size="sm" disabled={submitting} onClick={() => setDecision(null)}>{text.cancel}</Button><Button size="sm" disabled={submitting || reason.trim().length < 8} onClick={() => void submit()}>{submitting ? text.submitting : decision?.action === 'reject_recovery_plan' ? text.reject : text.approve}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}

function isProfileData(value: unknown): value is FactoryProfileData {
  return isObject(value) && Array.isArray(value.items) && typeof value.total === 'number'
    && typeof value.page === 'number' && typeof value.pageSize === 'number' && typeof value.simulation === 'boolean'
}
createRoot(document.getElementById('root')!).render(<App />)
