import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import {
  ASSISTANT_CONTEXT_SET_COMMAND,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET
} from '@xpert-ai/contracts'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCode2,
  GitBranch,
  History,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pin,
  RefreshCw
} from 'lucide-react'
import {
  Button,
  buttonVariants,
  Textarea,
  Badge,
  Checkbox,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@xpert-ai/plugin-shadcn-ui'
import { data, action, command, type Host } from './bridge'
import { reviewRefSchema, reviewLabel, snapshotSchema, findingSchema, diffLines } from '../../../src/domain'
import { workbenchPageSchema, type WorkbenchEntry } from '../../../src/workbench-contract'
import { i18n, errorMessage } from './i18n'
import { ReviewChanges } from './review-changes'
import { PipelineStart } from './pipeline-start'
import { openPipeline } from './repository-pipeline'
import { sourceLabel, statusLabel, statusTone } from './workbench-model'
const reviewSchema = z.object({
  id: z.string(),
  revision: z.number(),
  ref: reviewRefSchema,
  snapshot: snapshotSchema,
  status: z.string(),
  access: z.enum(['public', 'connected']),
  conversationId: z.string().nullish(),
  executionId: z.string().nullish(),
  automationRunId: z.string().nullish(),
  pipelineProjectId: z.string().nullish(),
  pinned: z.boolean(),
  viewed: z.array(z.string()),
  summary: z.string(),
  findings: z.array(findingSchema),
  errorCode: z.string().nullable(),
  submissionUrl: z.string().nullable()
})
type Review = z.infer<typeof reviewSchema>
type Props = {
  host: Host | null
  entry: WorkbenchEntry
  tab: string
  onTab: (tab: string) => void
  onSelect: (entry: WorkbenchEntry) => void
  refresh: number
  onChanged: () => void
}
export function ReviewDetail({ host, entry, tab, onTab, onSelect, refresh, onChanged }: Props) {
  const [review, setReview] = useState<Review | null>(null),
    [path, setPath] = useState(''),
    [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!!entry.reviewId)
  const [submitOpen, setSubmitOpen] = useState(false),
    [body, setBody] = useState(''),
    [event, setEvent] = useState('COMMENT'),
    [selected, setSelected] = useState<number[]>([])
  const [history, setHistory] = useState<WorkbenchEntry[]>([]),
    [historyPage, setHistoryPage] = useState(1),
    [historyTotal, setHistoryTotal] = useState(0)
  const epoch = useRef(0),
    request = useRef(0)
  const { t, locale, formatDate } = i18n(host?.locale)
  const message = (code: string) => errorMessage(code, locale)
  useEffect(
    () => () => {
      epoch.current++
      request.current++
    },
    []
  )
  async function publishSelection(value: Review) {
    await command(ASSISTANT_CONTEXT_SET_COMMAND, {
      key: 'codeReview',
      context: { reviewId: value.id, headSha: value.snapshot.headSha }
    })
  }
  async function loadDetail() {
    if (!entry.reviewId) {
      setReview(null)
      setLoading(false)
      return
    }
    const n = ++request.current,
      generation = epoch.current
    try {
      const result = z
        .object({ meta: z.object({ detail: reviewSchema }) })
        .parse(await data({ selectionId: entry.reviewId }))
      if (generation !== epoch.current || request.current !== n) return
      setReview(result.meta.detail)
      setError('')
      setPath((current) =>
        result.meta.detail.snapshot.files.some((f) => f.filename === current)
          ? current
          : result.meta.detail.snapshot.files[0]?.filename ?? ''
      )
      await publishSelection(result.meta.detail)
    } catch (e) {
      if (generation === epoch.current && request.current === n)
        setError(e instanceof Error ? e.message : 'operation_failed')
    } finally {
      if (generation === epoch.current && request.current === n) setLoading(false)
    }
  }
  useEffect(() => {
    void loadDetail()
  }, [entry.reviewId, refresh, host?.scopeRevision])
  useEffect(() => {
    if (tab !== 'history') return
    let active = true
    void data({ page: historyPage, parameters: { workbench: true, history: entry.key } })
      .then((value) => {
        const result = workbenchPageSchema.parse(value)
        if (active) {
          setHistory(result.items)
          setHistoryTotal(result.total)
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'operation_failed')
      })
    return () => {
      active = false
    }
  }, [entry.key, tab, historyPage, refresh, host?.scopeRevision])
  async function perform(fn: () => Promise<unknown>) {
    const generation = epoch.current
    setBusy(true)
    setError('')
    try {
      await fn()
      if (generation === epoch.current) onChanged()
    } catch (e) {
      if (generation === epoch.current && (!(e instanceof Error) || e.message !== 'context_changed'))
        setError(e instanceof Error ? e.message : 'operation_failed')
    } finally {
      if (generation === epoch.current) setBusy(false)
    }
  }
  async function act(key: string, input: Record<string, unknown> = {}) {
    if (!review) return
    const generation = epoch.current
    await perform(async () => {
      const result = reviewSchema.parse(await action(key, { id: review.id, revision: review.revision, ...input }))
      if (generation !== epoch.current) return
      setReview(result)
      await publishSelection(result)
      if (key === 'submit') setSubmitOpen(false)
    })
  }
  async function ask(finding: Review['findings'][number]) {
    if (!review) return
    await perform(async () => {
      await publishSelection(review)
      await command(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, {
        text: t('askFinding', { title: finding.title, path: finding.path, line: finding.line })
      })
    })
  }
  async function openProcess() {
    if (!review?.conversationId) return
    await command(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
      target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
      conversationId: review.conversationId,
      ...(review.executionId ? { executionId: review.executionId } : {})
    })
  }
  const frozen =
    review && (!!review.pipelineProjectId || ['running', 'submitting', 'submission_unknown'].includes(review.status))
  const file = review?.snapshot.files.find((f) => f.filename === path)
  const projectId = entry.projectId ?? review?.pipelineProjectId
  const pipeline = () =>
    projectId ? perform(() => openPipeline(projectId, entry.instanceId, entry.roundId)) : Promise.resolve()
  const pendingApproval = entry.status === 'awaiting_confirmation'
  const canRetry =
    entry.runId && ['failed', 'cancelled', 'skipped', 'superseded', 'needs_configuration'].includes(entry.status)
  const tabs = [
    { key: 'summary', label: t('detailSummary') },
    { key: 'changes', label: t('detailChanges') },
    { key: 'findings', label: `${t('detailFindings')} (${review?.findings.length ?? 0})` },
    { key: 'history', label: t('runHistory') },
    { key: 'checks', label: t('checks') }
  ]
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-5 pb-3 pt-4">
        <div className="mb-3 flex min-h-7 items-center justify-between gap-2 pl-10 text-xs text-muted-foreground">
          <span className="truncate">{reviewLabel(entry.ref)}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusTone(entry.status)}>
              {statusLabel(entry.status, locale)}
            </Badge>
            {review && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={buttonVariants({ size: 'icon', variant: 'ghost' })} aria-label={t('reviewSectionsLabel')}>
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled={busy} onSelect={() => void act('mark', { pinned: !review.pinned })}>
                    <Pin className="size-4" />
                    {t('pin')}
                    {review.pinned && <Check className="size-3" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy || !!frozen || !!review.automationRunId || review.ref.provider === 'local_git'}
                    onSelect={() => void act('refresh')}
                  >
                    <RefreshCw className="size-4" />
                    {t('refreshPr')}
                  </DropdownMenuItem>
                  {review.ref.provider === 'github' && (
                    <DropdownMenuItem asChild>
                      <a href={review.snapshot.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />
                        GitHub
                      </a>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <h2 className="break-words text-xl font-semibold leading-6">{entry.title}</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <code>{entry.headSha.slice(0, 12)}</code>
            <span>·</span>
            <span>{sourceLabel(entry, locale)}</span>
            <span>·</span>
            <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
          </div>
          {projectId && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void pipeline()}>
              <GitBranch className="size-4" />
              {t('viewReviewPipeline')}
            </Button>
          )}
        </div>
        {pendingApproval && (
          <div className="review-approval mt-4 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            <span>{t(entry.trigger === 'trial' ? 'trialComplete' : 'approvalWaiting')}</span>
            {projectId && entry.trigger !== 'trial' && (
              <Button variant="link" size="sm" disabled={busy} onClick={() => void pipeline()}>
                {t('goToApproval')}
              </Button>
            )}
          </div>
        )}
        {!projectId && review && (
          <PipelineStart
            key={`${review.id}:${host?.scopeRevision}`}
            host={host}
            review={review}
            instructions={focus}
            reload={() => {
              void loadDetail()
              onChanged()
            }}
          />
        )}
        {canRetry && (
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void perform(() => action('run.retry', { id: entry.runId }))}
          >
            <RefreshCw className="size-3" />
            {t('retryReview')}
          </Button>
        )}
      </header>
      {(error || review?.errorCode || (entry.reviewId && entry.reason)) && (
        <p role="alert" className="border-y bg-destructive/5 px-5 py-2 text-sm text-destructive">
          {message(error || review?.errorCode || entry.reason || '')}
        </p>
      )}
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-5" aria-label={t('reviewSectionsLabel')}>
        {tabs.map((item) => (
          <button
            key={item.key}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
              tab === item.key
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-current={tab === item.key ? 'page' : undefined}
            onClick={() => onTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {tab === 'history' ? (
          <div className="p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {review?.conversationId && (
                <Button size="sm" variant="outline" onClick={() => void perform(openProcess)}>
                  <History className="size-4" />
                  {t('viewProcess')}
                </Button>
              )}
              {review &&
                review.status === 'reviewed' &&
                !review.automationRunId &&
                !review.pipelineProjectId &&
                review.ref.provider === 'github' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBody(review.summary)
                      setSelected(review.findings.map((_, i) => i))
                      setSubmitOpen(true)
                    }}
                  >
                    {t('submitReview')}
                  </Button>
                )}
            </div>
            {history.map((item) => (
              <button
                key={item.id}
                className={`mb-3 block w-full rounded-lg border p-4 text-left hover:bg-accent ${
                  entry.id === item.id ? 'border-primary/40 bg-primary/5' : ''
                }`}
                onClick={() => onSelect(item)}
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <code>{item.headSha.slice(0, 12)}</code>
                  <Badge variant="outline" className={statusTone(item.status)}>
                    {statusLabel(item.status, locale)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {sourceLabel(item, locale)} · {formatDate(item.createdAt)}
                </p>
                {entry.id === item.id && <p className="mt-2 text-xs text-primary">{t('selectedRun')}</p>}
              </button>
            ))}
            {historyTotal > 20 && (
              <div className="flex items-center justify-between">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('previousPage')}
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs">
                  {historyPage} / {Math.ceil(historyTotal / 20)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('nextPage')}
                  disabled={historyPage * 20 >= historyTotal || historyPage >= 50}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ) : loading ? (
          <p role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t('loadingReviews')}
          </p>
        ) : !review ? (
          <div className="space-y-3 p-5">
            <h3 className="font-medium">{t('noSnapshot')}</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {entry.reason ? message(entry.reason) : t('noSnapshotHelp')}
            </p>
          </div>
        ) : (
          <>
            {tab === 'summary' && (
              <div className="space-y-5 p-5">
                <label className="block text-sm font-medium">
                  {t('reviewFocusOptional')}
                  <Textarea
                    className="mt-2"
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    maxLength={6000}
                    placeholder={t('forExampleConcurrencyAndAuthorization')}
                  />
                </label>
                {review.snapshot.warnings.length > 0 && (
                  <div className="rounded-lg border p-3 text-sm">
                    {t('coverageLimitations')}
                    <ul className="mt-2 list-inside list-disc text-muted-foreground">
                      {review.snapshot.warnings.map((w) => (
                        <li key={w}>
                          {{
                            files_truncated: t('fileListIsIncomplete'),
                            diff_unavailable_for_some_files: t('someFilesHaveNoDiffBinaryOrToo'),
                            checks_unavailable: t('checksAreUnavailable'),
                            comments_truncated: t('onlyTheFirstCommentsAreIncluded'),
                            checks_truncated: t('checkListIsIncomplete')
                          }[w] ?? w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <section>
                  <h3 className="mb-2 text-sm font-medium">{t('reviewSummary')}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {review.summary || t('startAReviewToGenerateADraftWith')}
                  </p>
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">{t('prDescription')}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {review.snapshot.body || t('noDescription')}
                  </p>
                </section>
                {review.submissionUrl && (
                  <a className="text-sm underline" href={review.submissionUrl} target="_blank" rel="noreferrer">
                    {t('viewSubmittedReview')}
                  </a>
                )}
              </div>
            )}
            {tab === 'changes' && (
              <ReviewChanges
                snapshot={review.snapshot}
                findings={review.findings}
                viewed={review.viewed}
                path={path}
                onPath={setPath}
                onViewed={(viewed) => void act('mark', { viewed })}
                onAsk={(finding) => void ask(finding)}
                busy={busy}
                locale={locale}
              />
            )}
            {tab === 'findings' && (
              <div className="space-y-3 p-5">
                {review.findings.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {review.status === 'reviewed'
                      ? t('noSupportedBugsWereFoundInTheReviewed')
                      : t('findingsWillAppearAfterTheReview')}
                  </p>
                )}
                {review.findings.map((f, i) => (
                  <article key={i} className="rounded-xl border p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{f.priority}</Badge>
                      <h3 className="text-sm font-semibold">{f.title}</h3>
                    </div>
                    <button
                      className="my-2 text-left font-mono text-xs text-muted-foreground underline"
                      onClick={() => {
                        setPath(f.path)
                        onTab('changes')
                      }}
                    >
                      {f.path}:{f.line} ({f.side})
                    </button>
                    <p className="whitespace-pre-wrap text-sm leading-6">{f.body}</p>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => void ask(f)}>
                      <MessageSquare className="size-4" />
                      {t('askInChat')}
                    </Button>
                  </article>
                ))}
              </div>
            )}
            {tab === 'checks' && (
              <div className="space-y-3 p-5">
                {review.snapshot.checks.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('noCheckRunsReturnedByGithub')}</p>
                )}
                {review.snapshot.checks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <span className="text-sm">{c.name}</span>
                    <Badge variant="secondary">{c.conclusion || c.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent className="max-h-[90vh] overflow-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('submitToGithub')}</AlertDialogTitle>
            <AlertDialogDescription>{t('thisSendsAReviewFromYourConnectedGithub')}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="text-sm">
            {t('reviewDecision')}
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMMENT">{t('comment')}</SelectItem>
                <SelectItem value="APPROVE">{t('approve')}</SelectItem>
                <SelectItem value="REQUEST_CHANGES">{t('requestChanges')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            {t('reviewMessage')}
            <Textarea
              className="mt-2 min-h-32"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={12000}
            />
          </label>
          {review?.findings.map((f, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={selected.includes(i)}
                onCheckedChange={(value) => setSelected((s) => (value ? [...s, i] : s.filter((v) => v !== i)))}
              />
              <span>
                [{f.priority}] {f.title}
              </span>
            </label>
          ))}
          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSubmitOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={busy || !body.trim()}
              onClick={() =>
                void act('submit', {
                  confirmed: true,
                  event,
                  body,
                  findings: selected,
                  headSha: review?.snapshot.headSha
                })
              }
            >
              <Check className="size-4" />
              {t('confirmSubmission')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
