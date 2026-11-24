import { Button, ScrollArea, Separator, Skeleton } from '@xpert-ai/plugin-shadcn-ui'
import {
  CheckCheck,
  CircleCheck,
  CircleX,
  FileText,
  LoaderCircle,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  TriangleAlert,
  WandSparkles
} from 'lucide-react'
import type { ReactNode } from 'react'
import { React } from './vendor'
import type { EvidenceField, ProposalDecision, ProposalDto, ReplyDetailDto } from '../../../workbench-contract'
import { formatDateTime, formatElapsed, t, type MessageKey } from './i18n'
import { ReplyStatus } from './status'
import { EmptyState, ErrorState, Notice } from './states'
import { EvidenceText, type EvidenceTarget } from './evidence'
import { ProposalCard } from './proposal'

const failureKeys: Record<string, MessageKey> = {
  no_delivery_info: 'failure.no_delivery_info',
  ambiguous_order: 'failure.ambiguous_order',
  unreadable: 'failure.unreadable',
  other: 'failure.other',
  model_failed: 'failure.model_failed',
  run_stopped: 'failure.run_stopped'
}

export type Busy = 'parse' | 'resend' | 'confirm' | 'acceptAll' | `decide:${string}` | null

const { useEffect, useRef, useState } = React

// A tool call or a newly saved proposal counts as progress. The host forwards nothing while the model is still
// generating, and saving four proposals in one turn has taken close to two minutes, so wait longer than that.
const STALL_MS = 150_000

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Elapsed time and saved proposals while the assistant works; after a quiet spell, resending becomes the main action. */
function ParsingNotice({
  reply,
  activityAt,
  timeoutMinutes,
  resending,
  onResend
}: {
  reply: ReplyDetailDto
  activityAt: number
  timeoutMinutes: number
  resending: boolean
  onResend: () => void
}) {
  const now = useNow(1000)
  const count = reply.proposals.length
  const key = `${reply.id}:${reply.parseAttempt}`
  // Per reply and attempt: when this one came on screen, how many proposals it had, and when that last grew.
  const seen = useRef<{ key: string; count: number; since: number } | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  useEffect(() => {
    if (seen.current?.key !== key) {
      seen.current = { key, count, since: Date.now() }
      setSavedAt(0)
      return
    }
    if (seen.current.count !== count) setSavedAt(Date.now())
    seen.current.count = count
  }, [key, count])

  const current = seen.current?.key === key ? seen.current : null
  const since = current?.since ?? now
  // Tool events carry no reply id, so only those after this reply came on screen count as its progress.
  const activity = activityAt >= since ? activityAt : 0
  const started = reply.parseRequestedAt ? Date.parse(reply.parseRequestedAt) : now
  const quietFor = now - Math.max(started, activity, current ? savedAt : 0)
  const stalled = quietFor > STALL_MS
  const resendButton = (
    <Button size="sm" variant={stalled ? 'default' : 'ghost'} disabled={resending} onClick={onResend}>
      {resending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Send aria-hidden />}
      {t('review.resend')}
    </Button>
  )
  if (stalled) {
    return (
      <Notice
        tone="warning"
        icon={TriangleAlert}
        title={t('banner.stalledTitle', { elapsed: formatElapsed(quietFor) })}
        body={t('banner.stalledBody', { minutes: timeoutMinutes })}
        action={resendButton}
      />
    )
  }
  return (
    <Notice
      tone="active"
      icon={LoaderCircle}
      spinning
      title={t('banner.parsingTitle')}
      body={
        <>
          <span className="block tabular-nums">
            {t('banner.parsingElapsed', { elapsed: formatElapsed(now - started) })}
          </span>
          <span className="block">{count ? t('banner.parsingSaved', { count }) : t('banner.parsingBody')}</span>
        </>
      }
      action={resendButton}
    />
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col">
      <div className="flex h-9 items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {aside}
      </div>
      <Separator />
      <div className="min-h-0 flex-1 pt-3">{children}</div>
    </section>
  )
}

export function ReplyReview({
  reply,
  loading,
  error,
  timeoutMinutes,
  activityAt,
  activeProposalId,
  evidenceTarget,
  busy,
  onRetryLoad,
  onParse,
  onResend,
  onConfirm,
  onAcceptAll,
  onActivate,
  onShowEvidence,
  onDecide,
  onEdit
}: {
  reply: ReplyDetailDto | null
  loading: boolean
  error: string | null
  timeoutMinutes: number
  /** When the host last reported an assistant tool call. */
  activityAt: number
  activeProposalId: string | null
  evidenceTarget: EvidenceTarget | null
  busy: Busy
  onRetryLoad: () => void
  onParse: (reply: ReplyDetailDto) => void
  onResend: (reply: ReplyDetailDto) => void
  onConfirm: (reply: ReplyDetailDto) => void
  onAcceptAll: (reply: ReplyDetailDto) => void
  onActivate: (proposal: ProposalDto) => void
  onShowEvidence: (proposal: ProposalDto, field: EvidenceField) => void
  onDecide: (proposal: ProposalDto, decision: Exclude<ProposalDecision, 'pending' | 'edited'>) => void
  onEdit: (proposal: ProposalDto) => void
}) {
  if (error) return <ErrorState message={error} onRetry={onRetryLoad} />
  if (!reply) {
    if (loading) {
      return (
        <div aria-busy="true" className="flex flex-col gap-4 p-5">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )
    }
    return <EmptyState icon={FileText} title={t('review.emptyTitle')} body={t('review.emptyBody')} />
  }

  const parsing = reply.status === 'parsing' && !reply.parseTimedOut
  const canParse = reply.status === 'received'
  const canRetry =
    reply.status === 'failed' ||
    reply.status === 'needs_followup' ||
    (reply.status === 'parsing' && reply.parseTimedOut)
  const reviewing = reply.status === 'pending_review'
  // A confirmation that started and stopped part-way: it can only be finished, after rejecting proposals whose order moved.
  const confirming = reviewing && reply.confirmationInProgress
  const readOnly = !reviewing
  const pending = reply.proposals.filter((proposal) => proposal.decision === 'pending').length
  const applying = reply.proposals.filter(
    (proposal) => proposal.decision === 'accepted' || proposal.decision === 'edited'
  )
  const staleApplying = applying.some((proposal) => proposal.stale)
  const acceptable = reply.proposals.filter((proposal) => proposal.decision === 'pending' && !proposal.stale).length
  // Proposals still in play whose order line moved after the assistant read it; only a new parse can refresh them.
  const staleCount = reply.proposals.filter((proposal) => proposal.stale && proposal.decision !== 'rejected').length
  // Only undecided proposals block confirmation. With everything rejected the reply is closed without touching orders,
  // which is also the only way to finish a started confirmation whose remaining proposals had to be rejected.
  const confirmHint = pending ? t('review.confirmHintPending', { count: pending }) : null
  const nothingToApply = !pending && !applying.length && reply.proposals.length > 0
  const failureText = reply.failureCode ? t(failureKeys[reply.failureCode] ?? 'failure.other') : null

  const retryButton = (variant: 'default' | 'outline') => (
    <Button size="sm" variant={variant} disabled={busy === 'parse'} onClick={() => onParse(reply)}>
      {busy === 'parse' ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <RotateCcw aria-hidden />}
      {t('review.retry')}
    </Button>
  )

  let primary: ReactNode = null
  if (canParse) {
    primary = (
      <Button size="sm" disabled={busy === 'parse'} onClick={() => onParse(reply)}>
        {busy === 'parse' ? (
          <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <WandSparkles aria-hidden />
        )}
        {t('review.parse')}
      </Button>
    )
  } else if (parsing) {
    primary = (
      <Button size="sm" disabled>
        <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        {t('review.parsing')}
      </Button>
    )
  } else if (reviewing) {
    primary = (
      <Button
        size="sm"
        disabled={busy === 'confirm' || Boolean(confirmHint) || staleApplying}
        onClick={() => onConfirm(reply)}
      >
        {busy === 'confirm' ? (
          <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <CircleCheck aria-hidden />
        )}
        {busy === 'confirm'
          ? t('review.confirming')
          : confirming
            ? t('review.resumeConfirm')
            : applying.length
              ? t('review.confirm', { count: applying.length })
              : nothingToApply
                ? t('review.confirmNone')
                : t('review.confirmIdle')}
      </Button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold">{t('review.title')}</h2>
            <ReplyStatus status={reply.status} timedOut={reply.parseTimedOut} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {t('review.receivedAt', { time: formatDateTime(reply.createdAt) })}
            {reply.parseAttempt > 0 ? ` · ${t('review.attempt', { count: reply.parseAttempt })}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {primary}
          {reviewing && confirmHint ? <p className="text-xs text-muted-foreground">{confirmHint}</p> : null}
          {reviewing && !confirming && nothingToApply ? (
            <p className="text-xs text-muted-foreground">{t('review.confirmNoneHint')}</p>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-2 px-5 empty:hidden">
        {parsing ? (
          <ParsingNotice
            reply={reply}
            activityAt={activityAt}
            timeoutMinutes={timeoutMinutes}
            resending={busy === 'resend'}
            onResend={() => onResend(reply)}
          />
        ) : null}
        {confirming ? (
          // A new parse is not possible here: part of this reply may already be in the orders.
          <Notice
            tone="warning"
            icon={TriangleAlert}
            title={t('banner.confirmingTitle')}
            body={staleCount ? t('banner.confirmingStaleBody', { count: staleCount }) : t('banner.confirmingBody')}
          />
        ) : reviewing && staleCount ? (
          <Notice
            tone="warning"
            icon={TriangleAlert}
            title={t('banner.staleTitle')}
            body={t('banner.staleBody', { count: staleCount })}
            action={retryButton('outline')}
          />
        ) : null}
        {reply.status === 'parsing' && reply.parseTimedOut ? (
          <Notice
            tone="warning"
            icon={TriangleAlert}
            title={t('banner.incompleteTitle')}
            body={t('banner.incompleteBody', { minutes: timeoutMinutes })}
            action={retryButton('default')}
          />
        ) : null}
        {reply.status === 'failed' ? (
          <Notice
            tone="danger"
            icon={CircleX}
            title={t('banner.failedTitle')}
            body={
              <>
                {failureText ? <span className="block">{failureText}</span> : null}
                {reply.failureMessage ? (
                  <span className="block break-words italic">“{reply.failureMessage}”</span>
                ) : null}
                {reply.failureCode === 'model_failed' ? (
                  <span className="block">{t('banner.modelFailedHint')}</span>
                ) : null}
                {reply.failureCode === 'run_stopped' ? (
                  <span className="block">{t('banner.runStoppedHint')}</span>
                ) : null}
                {reply.failureCode !== 'model_failed' && reply.failureCode !== 'run_stopped' ? (
                  <span className="block">{t('banner.retrySafe')}</span>
                ) : null}
              </>
            }
            action={canRetry ? retryButton('default') : undefined}
          />
        ) : null}
        {reply.status === 'needs_followup' ? (
          <Notice
            tone="warning"
            icon={MessageCircleQuestion}
            title={t('banner.followupTitle')}
            body={
              <>
                {failureText ? <span className="block">{failureText}</span> : null}
                {reply.failureMessage ? <span className="block italic">“{reply.failureMessage}”</span> : null}
                <span className="block">{t('banner.followupBody')}</span>
              </>
            }
            action={retryButton('outline')}
          />
        ) : null}
        {reply.status === 'confirmed' ? (
          <Notice
            tone="success"
            icon={CircleCheck}
            title={t('banner.confirmedTitle')}
            body={
              reply.confirmedByName
                ? t(nothingToApply ? 'banner.confirmedNoneBody' : 'banner.confirmedBody', {
                    user: reply.confirmedByName,
                    time: formatDateTime(reply.confirmedAt)
                  })
                : t(nothingToApply ? 'banner.confirmedNoneBodyAnonymous' : 'banner.confirmedBodyAnonymous', {
                    time: formatDateTime(reply.confirmedAt)
                  })
            }
          />
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-5 px-5 pt-4 pb-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-rows-1">
        <Section
          title={t('review.sourceTitle')}
          aside={<span className="text-[11px] text-muted-foreground">{t('review.sourceHint')}</span>}
        >
          <div className="max-h-56 overflow-y-auto rounded-md bg-muted/40 px-3 py-2 xl:max-h-none xl:h-full">
            <EvidenceText
              text={reply.rawText}
              proposals={reply.proposals}
              activeProposalId={activeProposalId}
              target={evidenceTarget}
              label={t('review.sourceTitle')}
            />
          </div>
        </Section>
        <Section
          title={t('review.proposalsTitle')}
          aside={
            reviewing && !confirming && acceptable >= 2 ? (
              <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => onAcceptAll(reply)}>
                {busy === 'acceptAll' ? (
                  <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <CheckCheck aria-hidden />
                )}
                {t('review.acceptAll', { count: acceptable })}
              </Button>
            ) : reply.proposals.length ? (
              <span className="text-xs text-muted-foreground tabular-nums">{reply.proposals.length}</span>
            ) : null
          }
        >
          {reply.proposals.length ? (
            <ScrollArea className="h-full min-h-0" data-sdf-scroll>
              {/* Bottom room so the last card can scroll above the host's floating chat. */}
              <div className="flex flex-col gap-3 p-1 pr-3 pb-20">
                {reply.proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    active={proposal.id === activeProposalId}
                    readOnly={readOnly}
                    confirming={confirming}
                    busy={busy === `decide:${proposal.id}` || busy === 'confirm' || busy === 'acceptAll'}
                    onActivate={() => onActivate(proposal)}
                    onShowEvidence={(field) => onShowEvidence(proposal, field)}
                    onDecide={(decision) => onDecide(proposal, decision)}
                    onEdit={() => onEdit(proposal)}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {parsing
                ? t('banner.parsingBody')
                : reply.status === 'failed'
                  ? t('review.noProposalsFailed')
                  : reply.status === 'needs_followup'
                    ? t('review.noProposalsUnresolved')
                    : t('review.noProposals')}
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}
