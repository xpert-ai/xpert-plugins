import type { FormEvent } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Check,
  ClipboardList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RefreshCw,
  ScrollArea,
  Search,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Send,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  WandSparkles
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, invokeClientCommand, notify, requestData } from './bridge'
import { ExecutionBoard } from './execution-board'
import { CATALOG, formatDate, resolveLocale } from './i18n'
import type {
  ActionItem,
  ActionStatus,
  Decision,
  ExecutionAction,
  ExecutionContext,
  ExecutionReview,
  HostContext,
  MeetingDetail,
  MeetingStatus,
  Priority,
  RiskReviewStatus,
  RiskSignal,
  ReviewStatus,
  WorkbenchData
} from './types'
import { React } from './vendor'

const { useCallback, useEffect, useMemo, useState } = React

export function MeetingWorkbench({ context }: { context: HostContext }) {
  const locale = resolveLocale(context.locale)
  const t = CATALOG[locale]
  const initialParameters = readParameters(context.initialQuery?.parameters ?? context.payload?.parameters)
  const [data, setData] = useState<WorkbenchData | null>(null)
  const [selectedId, setSelectedId] = useState(initialParameters.meetingId ?? '')
  const [search, setSearch] = useState(context.initialQuery?.search ?? '')
  const [searchDraft, setSearchDraft] = useState(context.initialQuery?.search ?? '')
  const [status, setStatus] = useState<MeetingStatus | 'all'>(initialParameters.status ?? 'all')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSource, setNewSource] = useState('')
  const [decisionDraft, setDecisionDraft] = useState<Decision | null>(null)
  const [actionDraft, setActionDraft] = useState<ActionItem | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'review' | 'execution'>('review')
  const [executionStatus, setExecutionStatus] = useState<'all' | Exclude<ActionStatus, 'pending_confirmation'>>('all')
  const [executionOwner, setExecutionOwner] = useState('')
  const [executionPage, setExecutionPage] = useState(1)

  const load = useCallback(async (meetingId = selectedId) => {
    setBusy(true)
    setLoadError('')
    try {
      const payload = await requestData({
        page: 1,
        pageSize: 30,
        search: search || undefined,
        parameters: {
          meetingId: meetingId || undefined,
          status: status === 'all' ? undefined : status,
          executionStatus: executionStatus === 'all' ? undefined : executionStatus,
          executionOwner: executionOwner.trim() || undefined,
          executionPage
        }
      })
      const next = parseWorkbenchData(payload)
      setData(next)
      const resolvedId = next.selectedMeeting?.id ?? next.meetings[0]?.id ?? ''
      setSelectedId(resolvedId)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.loadFailed)
    } finally {
      setBusy(false)
    }
  }, [executionOwner, executionPage, executionStatus, search, selectedId, status, t.loadFailed])

  useEffect(() => {
    void load()
  }, [executionOwner, executionPage, executionStatus, search, status])

  useEffect(() => {
    window.__meetingWorkbenchReload = () => void load()
    return () => { delete window.__meetingWorkbenchReload }
  }, [load])

  const meeting = data?.selectedMeeting ?? null
  const statusOptions = useMemo(() => [
    ['all', t.allStatuses],
    ['processing', t.statusLabels.processing],
    ['review_required', t.statusLabels.review_required],
    ['confirmed', t.statusLabels.confirmed],
    ['failed', t.statusLabels.failed]
  ] as const, [t])

  const selectMeeting = (id: string) => {
    setSelectedId(id)
    void load(id)
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setSearch(searchDraft.trim())
  }

  const submitNew = async () => {
    const title = newTitle.trim()
    const source = newSource.trim()
    if (!title || source.length < 20) return
    setBusy(true)
    try {
      await invokeClientCommand('assistant.chat.send_message', {
        text: '请创建一条新的会议提取任务并完整执行。会议标题：' + title + '\n\n会议内容：\n' + source
      })
      notify(t.sent)
      setNewOpen(false)
      setNewTitle('')
      setNewSource('')
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  const retryMeeting = async (target: MeetingDetail) => {
    setBusy(true)
    try {
      await invokeClientCommand('assistant.chat.send_message', {
        text: '请安全重试会议记录 ' + target.id + ' 的提取。先读取持久化上下文，使用新的 operationId，完成后提交人工复核；若仍失败请记录失败原因。'
      })
      notify(t.sent)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveDecision = async () => {
    if (!meeting || !decisionDraft) return
    setBusy(true)
    try {
      await executeAction('update_decision', meeting.id, {
        decisionId: decisionDraft.id,
        expectedRevision: meeting.revision,
        statement: decisionDraft.statement.trim(),
        reviewStatus: decisionDraft.reviewStatus
      })
      setDecisionDraft(null)
      notify(t.saved)
      await load(meeting.id)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
      await load(meeting.id)
    } finally {
      setBusy(false)
    }
  }

  const saveAction = async () => {
    if (!meeting || !actionDraft) return
    setBusy(true)
    try {
      await executeAction('update_action_item', meeting.id, {
        actionItemId: actionDraft.id,
        expectedRevision: meeting.revision,
        task: actionDraft.task.trim(),
        owner: actionDraft.owner?.trim() || null,
        dueDate: actionDraft.dueDate || null,
        priority: actionDraft.priority,
        status: actionDraft.status,
        reviewStatus: actionDraft.reviewStatus
      })
      setActionDraft(null)
      notify(t.saved)
      await load(meeting.id)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
      await load(meeting.id)
    } finally {
      setBusy(false)
    }
  }

  const confirmMeeting = async () => {
    if (!meeting) return
    setBusy(true)
    try {
      await executeAction('confirm_meeting', meeting.id, { expectedRevision: meeting.revision })
      setConfirmOpen(false)
      notify(t.confirmed)
      await load(meeting.id)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
      await load(meeting.id)
    } finally {
      setBusy(false)
    }
  }

  const runExecutionPatrol = async () => {
    setBusy(true)
    try {
      await invokeClientCommand('assistant.chat.send_message', {
        text: '请执行一次会议行动项执行巡检。先分页调用 meeting_get_execution_context 读取已确认决议和行动项；调用 meeting_begin_execution_review 创建巡检。客观逾期和缺字段由工作台规则处理，请重点识别描述含糊、重复任务、决议冲突、依赖风险和负责人负载集中。逐条保存有证据的语义风险，最后生成中文的下一次会议跟进简报并调用 meeting_finalize_execution_review。若无法完成，请记录巡检失败。'
      })
      notify(t.patrolSent)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  const updateExecutionAction = async (action: ExecutionAction, nextStatus: Exclude<ActionStatus, 'pending_confirmation'>) => {
    setBusy(true)
    try {
      await executeAction('update_execution_action', action.meetingId, {
        actionItemId: action.id,
        expectedRevision: action.meetingRevision,
        status: nextStatus
      })
      notify(t.executionSaved)
      await load(selectedId)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
      await load(selectedId)
    } finally {
      setBusy(false)
    }
  }

  const reviewRisk = async (risk: RiskSignal, reviewStatus: Exclude<RiskReviewStatus, 'open'>) => {
    const review = data?.execution.latestReview
    if (!review || !risk.reviewId) return
    setBusy(true)
    try {
      await executeAction('update_risk_signal_status', review.id, {
        riskSignalId: risk.id,
        expectedRevision: review.revision,
        reviewStatus
      })
      notify(t.saved)
      await load(selectedId)
    } catch (error) {
      notify(error instanceof Error ? error.message : t.saveFailed, 'error')
      await load(selectedId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <ClipboardList className="size-4" aria-hidden />
            </span>
            <div>
              <h1 className="text-base font-semibold">{t.title}</h1>
              <p className="text-xs text-muted-foreground">{t.subtitle}</p>
            </div>
          </div>
        </div>
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'review' | 'execution')}>
          <TabsList><TabsTrigger value="review">{t.reviewTab}</TabsTrigger><TabsTrigger value="execution">{t.executionTab}</TabsTrigger></TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy} aria-label={t.save}>
            <RefreshCw className={busy ? 'animate-spin' : ''} aria-hidden />
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <WandSparkles aria-hidden /> {t.newExtraction}
          </Button>
        </div>
      </header>

      {viewMode === 'review' ? <div className="grid min-h-0 grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r bg-muted/20">
          <div className="space-y-2 border-b p-3">
            <form className="relative" onSubmit={submitSearch}>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={t.search} className="pl-8" />
            </form>
            <Select value={status} onValueChange={(value) => setStatus(value as MeetingStatus | 'all')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            {data ? (
              <div className="grid grid-cols-3 gap-1 text-center text-[11px] text-muted-foreground">
                <span>{t.total} {data.summary.total}</span>
                <span>{t.reviewRequired} {data.summary.reviewRequired}</span>
                <span>{t.failed} {data.summary.failed}</span>
              </div>
            ) : null}
          </div>
          <ScrollArea data-meeting-scroll className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {data?.meetings.map((item) => (
                <Button
                  key={item.id}
                  variant={selectedId === item.id ? 'secondary' : 'ghost'}
                  className="h-auto w-full justify-start px-3 py-2 text-left"
                  onClick={() => selectMeeting(item.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title || t.untitled}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{formatDate(locale, item.updatedAt)}</span>
                      <StatusBadge status={item.status} label={t.statusLabels[item.status]} />
                    </span>
                  </span>
                </Button>
              ))}
              {!busy && data?.meetings.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{t.empty}</p>
                  <p className="mt-1 text-xs">{t.emptyHint}</p>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        <section className="min-h-0 overflow-hidden">
          {loadError ? (
            <div className="m-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</div>
          ) : meeting ? (
            <ScrollArea data-meeting-scroll className="h-full">
              <div className="mx-auto max-w-6xl space-y-5 p-5">
                <MeetingHeader meeting={meeting} t={t} locale={locale} busy={busy} onConfirm={() => setConfirmOpen(true)} onRetry={() => void retryMeeting(meeting)} />
                <section aria-labelledby="meeting-decisions">
                  <SectionTitle id="meeting-decisions" title={t.decisions} count={meeting.decisions.length} />
                  <div className="space-y-2">
                    {meeting.decisions.map((decision) => (
                      <Card key={decision.id} className="shadow-none">
                        <CardContent className="space-y-2 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm leading-6">{decision.statement}</p>
                            {meeting.status === 'review_required' ? <Button size="sm" variant="outline" onClick={() => setDecisionDraft({ ...decision })}>{t.edit}</Button> : null}
                          </div>
                          <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                            <strong className="text-foreground">{t.evidence}：</strong>{decision.evidenceQuote}
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{t.reviewLabels[decision.reviewStatus]}</Badge>
                            <span>{t.confidence} {Math.round(decision.confidence * 100)}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {meeting.decisions.length === 0 ? <EmptyRow text={t.noDecisions} /> : null}
                  </div>
                </section>
                <section aria-labelledby="meeting-actions">
                  <SectionTitle id="meeting-actions" title={t.actions} count={meeting.actionItems.length} />
                  <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[minmax(16rem,2fr)_minmax(7rem,1fr)_7rem_7rem_auto] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                      <span>{t.actions}</span><span>{t.owner}</span><span>{t.dueDate}</span><span>{t.status}</span><span />
                    </div>
                    {meeting.actionItems.map((action) => (
                      <div key={action.id} className="border-b px-4 py-3 last:border-b-0">
                        <div className="grid grid-cols-[minmax(16rem,2fr)_minmax(7rem,1fr)_7rem_7rem_auto] items-start gap-3">
                          <div>
                            <p className="text-sm font-medium">{action.task}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.evidence}：{action.evidenceQuote}</p>
                          </div>
                          <span className="text-sm">{action.owner ?? '—'}</span>
                          <span className="text-sm">{action.dueDate ?? '—'}</span>
                          <Badge variant="outline">{t.statusLabels[action.status]}</Badge>
                          {meeting.status === 'review_required' ? <Button size="sm" variant="outline" onClick={() => setActionDraft({ ...action })}>{t.edit}</Button> : null}
                        </div>
                      </div>
                    ))}
                    {meeting.actionItems.length === 0 ? <EmptyRow text={t.noActions} /> : null}
                  </div>
                </section>
                <section aria-labelledby="meeting-source">
                  <SectionTitle id="meeting-source" title={t.source} />
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-6">{meeting.sourceText}</pre>
                </section>
              </div>
            </ScrollArea>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
              <div><ClipboardList className="mx-auto mb-3 size-8" aria-hidden /><p className="font-medium text-foreground">{t.empty}</p><p className="mt-1">{t.emptyHint}</p></div>
            </div>
          )}
        </section>
      </div> : data ? <ExecutionBoard
        execution={data.execution}
        locale={locale}
        t={t}
        busy={busy}
        statusFilter={executionStatus}
        ownerFilter={executionOwner}
        onStatusFilter={(value) => { setExecutionStatus(value); setExecutionPage(1) }}
        onOwnerFilter={(value) => { setExecutionOwner(value); setExecutionPage(1) }}
        onRunPatrol={() => void runExecutionPatrol()}
        onUpdateAction={(action, nextStatus) => void updateExecutionAction(action, nextStatus)}
        onReviewRisk={(risk, nextStatus) => void reviewRisk(risk, nextStatus)}
        onPage={setExecutionPage}
      /> : <div className="grid h-full place-items-center text-sm text-muted-foreground">{t.loading}</div>}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t.newExtraction}</DialogTitle><DialogDescription>{t.emptyHint}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="grid gap-2 text-sm"><span className="font-medium">{t.meetingTitle}</span><Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder={t.meetingTitlePlaceholder} maxLength={200} /></label>
            <label className="grid gap-2 text-sm"><span className="font-medium">{t.meetingContent}</span><Textarea value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder={t.meetingContentPlaceholder} className="min-h-64" maxLength={30000} /></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewOpen(false)}>{t.cancel}</Button><Button onClick={() => void submitNew()} disabled={busy || !newTitle.trim() || newSource.trim().length < 20}><Send aria-hidden />{t.submitToAssistant}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(decisionDraft)} onOpenChange={(open) => { if (!open) setDecisionDraft(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.edit} · {t.decisions}</DialogTitle><DialogDescription>{t.reviewHint}</DialogDescription></DialogHeader>
          {decisionDraft ? <div className="space-y-4">
            <Textarea value={decisionDraft.statement} onChange={(event) => setDecisionDraft({ ...decisionDraft, statement: event.target.value })} className="min-h-32" />
            <ReviewStatusSelect label={t.reviewStatus} value={decisionDraft.reviewStatus} onChange={(reviewStatus) => setDecisionDraft({ ...decisionDraft, reviewStatus })} labels={t.reviewLabels} />
          </div> : null}
          <DialogFooter><Button variant="outline" onClick={() => setDecisionDraft(null)}>{t.cancel}</Button><Button onClick={() => void saveDecision()} disabled={busy || !decisionDraft?.statement.trim()}>{t.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionDraft)} onOpenChange={(open) => { if (!open) setActionDraft(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{t.edit} · {t.actions}</DialogTitle><DialogDescription>{t.reviewHint}</DialogDescription></DialogHeader>
          {actionDraft ? <div className="grid gap-4">
            <label className="grid gap-2 text-sm"><span className="font-medium">{t.actions}</span><Textarea value={actionDraft.task} onChange={(event) => setActionDraft({ ...actionDraft, task: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2 text-sm"><span className="font-medium">{t.owner}</span><Input value={actionDraft.owner ?? ''} onChange={(event) => setActionDraft({ ...actionDraft, owner: event.target.value || null })} /></label>
              <label className="grid gap-2 text-sm"><span className="font-medium">{t.dueDate}</span><Input type="date" value={actionDraft.dueDate ?? ''} onChange={(event) => setActionDraft({ ...actionDraft, dueDate: event.target.value || null })} /></label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <LabeledSelect label={t.priority} value={actionDraft.priority} options={Object.entries(t.priorityLabels)} onChange={(value) => setActionDraft({ ...actionDraft, priority: value as Priority })} />
              <LabeledSelect label={t.status} value={actionDraft.status} options={Object.entries(t.statusLabels).filter(([key]) => ['pending_confirmation', 'pending', 'in_progress', 'completed', 'cancelled'].includes(key))} onChange={(value) => setActionDraft({ ...actionDraft, status: value as ActionStatus })} />
              <LabeledSelect label={t.reviewStatus} value={actionDraft.reviewStatus} options={Object.entries(t.reviewLabels)} onChange={(value) => setActionDraft({ ...actionDraft, reviewStatus: value as ReviewStatus })} />
            </div>
          </div> : null}
          <DialogFooter><Button variant="outline" onClick={() => setActionDraft(null)}>{t.cancel}</Button><Button onClick={() => void saveAction()} disabled={busy || !actionDraft?.task.trim()}>{t.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle><AlertDialogDescription>{t.confirmDescription}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void confirmMeeting()}><Check aria-hidden />{t.confirm}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function MeetingHeader({ meeting, t, locale, busy, onConfirm, onRetry }: {
  meeting: MeetingDetail
  t: (typeof CATALOG)['zh-Hans']
  locale: 'zh-Hans' | 'en-US'
  busy: boolean
  onConfirm: () => void
  onRetry: () => void
}) {
  const hint = meeting.status === 'processing' ? t.processingHint : meeting.status === 'review_required' ? t.reviewHint : meeting.status === 'confirmed' ? t.confirmedHint : t.retryHint
  return <Card className="shadow-none">
    <CardHeader className="border-b">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><CardTitle>{meeting.title}</CardTitle><StatusBadge status={meeting.status} label={t.statusLabels[meeting.status]} /></div>
          <CardDescription className="mt-2">{hint}</CardDescription>
        </div>
        <div className="flex gap-2">
          {meeting.status === 'failed' ? <Button onClick={onRetry} disabled={busy}><RefreshCw aria-hidden />{t.retry}</Button> : null}
          {meeting.status === 'review_required' ? <Button onClick={onConfirm} disabled={busy}><Check aria-hidden />{t.confirm}</Button> : null}
        </div>
      </div>
    </CardHeader>
    <CardContent className="grid grid-cols-4 gap-4 py-4 text-sm">
      <Metric label={t.decisions} value={meeting.decisionCount} />
      <Metric label={t.actions} value={meeting.actionItemCount} />
      <Metric label={t.attempt} value={meeting.extractionAttempt} />
      <Metric label={t.revision} value={meeting.revision} hint={formatDate(locale, meeting.updatedAt)} />
      {meeting.status === 'failed' ? <div className="col-span-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><strong>{t.extractionFailed} · {meeting.errorCode}</strong><p className="mt-1">{meeting.errorMessage}</p></div> : null}
    </CardContent>
  </Card>
}

function SectionTitle({ id, title, count }: { id: string; title: string; count?: number }) {
  return <div data-section-layout="title-actions-divider-content" className="mb-3"><header className="flex items-center justify-between"><h2 id={id} className="text-sm font-semibold">{title}</h2>{count != null ? <Badge variant="secondary">{count}</Badge> : null}</header><Separator className="mt-2" /></div>
}

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p>{hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}</div>
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>
}

function StatusBadge({ status, label }: { status: MeetingStatus; label: string }) {
  const className = status === 'failed' ? 'border-destructive/40 text-destructive' : status === 'confirmed' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : status === 'review_required' ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : 'border-sky-500/40 text-sky-700 dark:text-sky-300'
  return <Badge variant="outline" className={className}>{label}</Badge>
}

function LabeledSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm"><span className="font-medium">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></label>
}

function ReviewStatusSelect({ label, value, onChange, labels }: { label: string; value: ReviewStatus; onChange: (value: ReviewStatus) => void; labels: Record<ReviewStatus, string> }) {
  return <LabeledSelect label={label} value={value} options={Object.entries(labels)} onChange={(next) => onChange(next as ReviewStatus)} />
}

function readParameters(value: Record<string, unknown> | undefined): { meetingId?: string; status?: MeetingStatus } {
  const meetingId = typeof value?.['meetingId'] === 'string' ? value['meetingId'] : undefined
  const rawStatus = value?.['status']
  const status = rawStatus === 'processing' || rawStatus === 'review_required' || rawStatus === 'confirmed' || rawStatus === 'failed' ? rawStatus : undefined
  return { meetingId, status }
}

function parseWorkbenchData(value: unknown): WorkbenchData {
  const record = readRecord(value, 'workbench response')
  const payload = record['meta'] == null ? record : readRecord(record['meta'], 'workbench meta')
  const summary = readRecord(payload['summary'], 'workbench summary')
  const rawMeetings = readArray(payload['meetings'], 'meetings')
  return {
    summary: {
      total: readNumber(summary['total'], 'summary.total'),
      processing: readNumber(summary['processing'], 'summary.processing'),
      reviewRequired: readNumber(summary['reviewRequired'], 'summary.reviewRequired'),
      confirmed: readNumber(summary['confirmed'], 'summary.confirmed'),
      failed: readNumber(summary['failed'], 'summary.failed')
    },
    meetings: rawMeetings.map(parseMeetingSummary),
    selectedMeeting: payload['selectedMeeting'] == null ? null : parseMeetingDetail(payload['selectedMeeting']),
    page: readNumber(payload['page'], 'page'),
    pageSize: readNumber(payload['pageSize'], 'pageSize'),
    total: readNumber(payload['total'], 'total'),
    execution: parseExecutionContext(payload['execution'])
  }
}

function parseExecutionContext(value: unknown): ExecutionContext {
  const record = readRecord(value, 'execution context')
  const summary = readRecord(record['summary'], 'execution summary')
  return {
    summary: {
      total: readNumber(summary['total'], 'execution.summary.total'),
      pending: readNumber(summary['pending'], 'execution.summary.pending'),
      inProgress: readNumber(summary['inProgress'], 'execution.summary.inProgress'),
      completed: readNumber(summary['completed'], 'execution.summary.completed'),
      cancelled: readNumber(summary['cancelled'], 'execution.summary.cancelled'),
      overdue: readNumber(summary['overdue'], 'execution.summary.overdue'),
      dueSoon: readNumber(summary['dueSoon'], 'execution.summary.dueSoon'),
      missingOwner: readNumber(summary['missingOwner'], 'execution.summary.missingOwner'),
      missingDueDate: readNumber(summary['missingDueDate'], 'execution.summary.missingDueDate')
    },
    actions: readArray(record['actions'], 'execution.actions').map(parseExecutionAction),
    decisions: readArray(record['decisions'], 'execution.decisions').map((item) => {
      const decision = readRecord(item, 'execution decision')
      return {
        id: readString(decision['id'], 'execution.decision.id'),
        meetingId: readString(decision['meetingId'], 'execution.decision.meetingId'),
        meetingTitle: readString(decision['meetingTitle'], 'execution.decision.meetingTitle'),
        statement: readString(decision['statement'], 'execution.decision.statement'),
        evidenceQuote: readString(decision['evidenceQuote'], 'execution.decision.evidenceQuote'),
        confidence: readNumber(decision['confidence'], 'execution.decision.confidence')
      }
    }),
    ruleSignals: readArray(record['ruleSignals'], 'execution.ruleSignals').map(parseRiskSignal),
    agentSignals: readArray(record['agentSignals'], 'execution.agentSignals').map(parseRiskSignal),
    latestReview: record['latestReview'] == null ? null : parseExecutionReview(record['latestReview']),
    page: readNumber(record['page'], 'execution.page'),
    pageSize: readNumber(record['pageSize'], 'execution.pageSize'),
    total: readNumber(record['total'], 'execution.total'),
    hasMore: readBoolean(record['hasMore'], 'execution.hasMore')
  }
}

function parseExecutionAction(value: unknown): ExecutionAction {
  const record = readRecord(value, 'execution action')
  return {
    ...parseActionItem(record),
    meetingId: readString(record['meetingId'], 'execution.action.meetingId'),
    meetingTitle: readString(record['meetingTitle'], 'execution.action.meetingTitle'),
    meetingRevision: readNumber(record['meetingRevision'], 'execution.action.meetingRevision'),
    ruleFlags: readArray(record['ruleFlags'], 'execution.action.ruleFlags').map(readRuleFlag)
  }
}

function parseRiskSignal(value: unknown): RiskSignal {
  const record = readRecord(value, 'risk signal')
  return {
    id: readString(record['id'], 'risk.id'),
    reviewId: readNullableString(record['reviewId'], 'risk.reviewId'),
    signalKey: readString(record['signalKey'], 'risk.signalKey'),
    source: readRiskSource(record['source']),
    riskType: readRiskType(record['riskType']),
    severity: readRiskSeverity(record['severity']),
    title: readString(record['title'], 'risk.title'),
    rationale: readString(record['rationale'], 'risk.rationale'),
    evidenceQuote: readString(record['evidenceQuote'], 'risk.evidenceQuote'),
    recommendation: readString(record['recommendation'], 'risk.recommendation'),
    meetingId: readNullableString(record['meetingId'], 'risk.meetingId'),
    actionItemId: readNullableString(record['actionItemId'], 'risk.actionItemId'),
    confidence: readNumber(record['confidence'], 'risk.confidence'),
    reviewStatus: readRiskReviewStatus(record['reviewStatus']),
    createdAt: readString(record['createdAt'], 'risk.createdAt')
  }
}

function parseExecutionReview(value: unknown): ExecutionReview {
  const record = readRecord(value, 'execution review')
  const status = record['status']
  if (status !== 'processing' && status !== 'ready' && status !== 'failed') throw new Error('Invalid execution review status')
  return {
    id: readString(record['id'], 'execution.review.id'),
    status,
    revision: readNumber(record['revision'], 'execution.review.revision'),
    focus: readString(record['focus'], 'execution.review.focus'),
    summary: readNullableString(record['summary'], 'execution.review.summary'),
    followUpBrief: readNullableString(record['followUpBrief'], 'execution.review.followUpBrief'),
    riskCount: readNumber(record['riskCount'], 'execution.review.riskCount'),
    errorCode: readNullableString(record['errorCode'], 'execution.review.errorCode'),
    errorMessage: readNullableString(record['errorMessage'], 'execution.review.errorMessage'),
    createdAt: readString(record['createdAt'], 'execution.review.createdAt'),
    updatedAt: readString(record['updatedAt'], 'execution.review.updatedAt'),
    completedAt: readNullableString(record['completedAt'], 'execution.review.completedAt')
  }
}

function parseMeetingSummary(value: unknown) {
  const record = readRecord(value, 'meeting summary')
  return {
    id: readString(record['id'], 'meeting.id'),
    title: readString(record['title'], 'meeting.title'),
    status: readMeetingStatus(record['status']),
    revision: readNumber(record['revision'], 'meeting.revision'),
    extractionAttempt: readNumber(record['extractionAttempt'], 'meeting.extractionAttempt'),
    decisionCount: readNumber(record['decisionCount'], 'meeting.decisionCount'),
    actionItemCount: readNumber(record['actionItemCount'], 'meeting.actionItemCount'),
    errorCode: readNullableString(record['errorCode'], 'meeting.errorCode'),
    updatedAt: readString(record['updatedAt'], 'meeting.updatedAt'),
    createdAt: readString(record['createdAt'], 'meeting.createdAt')
  }
}

function parseMeetingDetail(value: unknown): MeetingDetail {
  const record = readRecord(value, 'meeting detail')
  return {
    ...parseMeetingSummary(record),
    sourceText: readString(record['sourceText'], 'meeting.sourceText'),
    errorMessage: readNullableString(record['errorMessage'], 'meeting.errorMessage'),
    reviewedAt: readNullableString(record['reviewedAt'], 'meeting.reviewedAt'),
    decisions: readArray(record['decisions'], 'meeting.decisions').map(parseDecision),
    actionItems: readArray(record['actionItems'], 'meeting.actionItems').map(parseActionItem)
  }
}

function parseDecision(value: unknown): Decision {
  const record = readRecord(value, 'decision')
  return {
    id: readString(record['id'], 'decision.id'),
    itemKey: readString(record['itemKey'], 'decision.itemKey'),
    statement: readString(record['statement'], 'decision.statement'),
    evidenceQuote: readString(record['evidenceQuote'], 'decision.evidenceQuote'),
    confidence: readNumber(record['confidence'], 'decision.confidence'),
    reviewStatus: readReviewStatus(record['reviewStatus']),
    sortOrder: readNumber(record['sortOrder'], 'decision.sortOrder')
  }
}

function parseActionItem(value: unknown): ActionItem {
  const record = readRecord(value, 'action item')
  return {
    id: readString(record['id'], 'action.id'),
    itemKey: readString(record['itemKey'], 'action.itemKey'),
    task: readString(record['task'], 'action.task'),
    owner: readNullableString(record['owner'], 'action.owner'),
    dueDate: readNullableString(record['dueDate'], 'action.dueDate'),
    priority: readPriority(record['priority']),
    status: readActionStatus(record['status']),
    evidenceQuote: readString(record['evidenceQuote'], 'action.evidenceQuote'),
    confidence: readNumber(record['confidence'], 'action.confidence'),
    reviewStatus: readReviewStatus(record['reviewStatus']),
    sortOrder: readNumber(record['sortOrder'], 'action.sortOrder')
  }
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value
}

function readString(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}`)
  return value
}

function readNullableString(value: unknown, label: string) {
  if (value == null) return null
  return readString(value, label)
}

function readNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}`)
  return value
}

function readBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`)
  return value
}

function readMeetingStatus(value: unknown): MeetingStatus {
  if (value === 'processing' || value === 'review_required' || value === 'confirmed' || value === 'failed') return value
  throw new Error('Invalid meeting.status')
}

function readReviewStatus(value: unknown): ReviewStatus {
  if (value === 'pending' || value === 'confirmed' || value === 'edited' || value === 'rejected') return value
  throw new Error('Invalid reviewStatus')
}

function readActionStatus(value: unknown): ActionStatus {
  if (value === 'pending_confirmation' || value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'cancelled') return value
  throw new Error('Invalid action.status')
}

function readPriority(value: unknown): Priority {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  throw new Error('Invalid action.priority')
}

function readRuleFlag(value: unknown): ExecutionAction['ruleFlags'][number] {
  if (value === 'overdue' || value === 'due_soon' || value === 'missing_owner' || value === 'missing_due_date') return value
  throw new Error('Invalid execution rule flag')
}

function readRiskSource(value: unknown): RiskSignal['source'] {
  if (value === 'rule' || value === 'agent') return value
  throw new Error('Invalid risk source')
}

function readRiskSeverity(value: unknown): RiskSignal['severity'] {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  throw new Error('Invalid risk severity')
}

function readRiskReviewStatus(value: unknown): RiskReviewStatus {
  if (value === 'open' || value === 'accepted' || value === 'dismissed' || value === 'resolved') return value
  throw new Error('Invalid risk review status')
}

function readRiskType(value: unknown): RiskSignal['riskType'] {
  const values: RiskSignal['riskType'][] = ['overdue', 'due_soon', 'missing_owner', 'missing_due_date', 'ambiguous_commitment', 'duplicate_action', 'decision_conflict', 'dependency_risk', 'workload_concentration', 'other']
  if (typeof value === 'string' && values.includes(value as RiskSignal['riskType'])) return value as RiskSignal['riskType']
  throw new Error('Invalid risk type')
}
