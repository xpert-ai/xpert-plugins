import { useEffect, useState } from 'react'
import type { ComplaintAnalysis, Evidence, Resolution, TicketDetail } from '../../domain/contracts.js'
import { SEVERITY_GUIDE } from '../../domain/policy.js'
import { useServices } from '../context.js'
import { isMessageKey } from '../i18n.js'
import { SeverityBadge, StatusPill } from './badges.js'
import { ReviewForm } from './ReviewForm.js'

interface Props {
  ticket: TicketDetail
  busy: boolean
  onAnalyze: () => void
  onConfirm: (resolution: Resolution) => void
}

export function TicketDetailView({ ticket, busy, onAnalyze, onConfirm }: Props) {
  const { t, formatTime } = useServices()
  const [highlighted, setHighlighted] = useState<string[]>([])
  useEffect(() => setHighlighted([]), [ticket.id, ticket.attemptCount])

  const analyzeLabel = ticket.status === 'analysis_failed' ? t('detail.retry') : ticket.status === 'pending_review' ? t('detail.reanalyze') : t('detail.analyze')
  const canAnalyze = ticket.status === 'draft' || ticket.status === 'analysis_failed' || ticket.status === 'pending_review'

  return (
    <div className="ct-detail">
      <section className="ct-section">
        <header className="ct-section-head">
          <div className="ct-title-row">
            <h1 className="ct-ticket-no">{ticket.ticketNo}</h1>
            <StatusPill status={ticket.status} />
            {ticket.severity ? <SeverityBadge severity={ticket.severity} /> : null}
            {ticket.faultInjection === 'first_attempt' ? <span className="ct-pill ct-fault">{t('detail.faultBadge')}</span> : null}
          </div>
          {canAnalyze ? (
            <button
              type="button"
              className={ticket.status === 'pending_review' ? 'xui-button' : 'xui-button xui-button-primary'}
              disabled={busy}
              onClick={onAnalyze}
            >
              {analyzeLabel}
            </button>
          ) : null}
        </header>
        <p className="ct-meta">
          {t(`channel.${ticket.channel}`)} · {t('detail.customer')}：{ticket.customerName ?? t('detail.anonymous')} · {t('detail.createdAt', { time: formatTime(ticket.createdAt) })}
        </p>
        <StatusBanner ticket={ticket} />
      </section>

      <section className="ct-section">
        <header className="ct-section-head">
          <h2>{t('detail.original')}</h2>
        </header>
        <hr className="ct-divider" />
        <p className="ct-original">
          {ticket.sentences.map((sentence) => (
            <span key={sentence.id} className={highlighted.includes(sentence.id) ? 'ct-sentence ct-sentence-hit' : 'ct-sentence'}>
              <sup className="ct-sentence-id">{sentence.id}</sup>
              {sentence.text}
            </span>
          ))}
        </p>
        <p className="ct-hint">{t('detail.originalHint')}</p>
      </section>

      {ticket.analysis ? <AnalysisSection analysis={ticket.analysis} onEvidence={setHighlighted} /> : null}

      {ticket.status === 'pending_review' && ticket.analysis ? (
        <section className="ct-section">
          <header className="ct-section-head">
            <h2>{t('review.title')}</h2>
          </header>
          <hr className="ct-divider" />
          {/* key: a re-analysis must reset the form to the new suggestion instead of keeping stale edits. */}
          <ReviewForm key={`${ticket.id}:${ticket.attemptCount}`} analysis={ticket.analysis} submitting={busy} onConfirm={onConfirm} />
        </section>
      ) : null}

      {ticket.resolution ? <ResolutionSection ticket={ticket} resolution={ticket.resolution} /> : null}

      <section className="ct-section">
        <header className="ct-section-head">
          <h2>{t('history.title')}</h2>
        </header>
        <hr className="ct-divider" />
        <ol className="ct-history">
          <li>
            <span className="ct-history-time">{formatTime(ticket.createdAt)}</span>
            {t('history.created')}
          </li>
          {ticket.attempts.map((attempt) => (
            <li key={attempt.attemptNo}>
              <span className="ct-history-time">{formatTime(attempt.startedAt)}</span>
              {t('history.attempt', { attempt: attempt.attemptNo })} · <span className={`ct-attempt-${attempt.status}`}>{t(`attempt.${attempt.status}`)}</span>
              {attempt.failureCode ? (
                <span className="ct-history-reason">
                  {' '}
                  — {t(`failure.${attempt.failureCode}`)}
                  {attempt.failureMessage ? ` ${attempt.failureMessage}` : ''}
                </span>
              ) : null}
            </li>
          ))}
          {ticket.confirmedAt ? (
            <li>
              <span className="ct-history-time">{formatTime(ticket.confirmedAt)}</span>
              {t('history.confirmed')}
            </li>
          ) : null}
        </ol>
      </section>
    </div>
  )
}

function StatusBanner({ ticket }: { ticket: TicketDetail }) {
  const { t, formatTime } = useServices()
  const [now, setNow] = useState(() => Date.now())
  const analyzing = ticket.status === 'analyzing'
  useEffect(() => {
    if (!analyzing) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [analyzing])

  if (ticket.status === 'analyzing') {
    const startedAt = ticket.analysisRequestedAt ? Date.parse(ticket.analysisRequestedAt) : now
    const seconds = Math.max(0, Math.round((now - startedAt) / 1000))
    return (
      <div className="xui-notice" role="status">
        <span className="ct-spinner" aria-hidden="true" />
        {t('banner.analyzing', { attempt: ticket.attemptCount, seconds, timeout: Math.round(ticket.analysisTimeoutMs / 1000) })}
      </div>
    )
  }
  if (ticket.status === 'analysis_failed') {
    const key = `failure.${ticket.failureCode ?? 'timeout'}`
    const reason = `${t(isMessageKey(key) ? key : 'failure.timeout')}${ticket.failureMessage ? ` ${ticket.failureMessage}` : ''}`
    return (
      <div className="xui-notice xui-notice-error ct-notice-stack" role="alert">
        <strong>{t('banner.failed', { attempt: ticket.attemptCount, reason })}</strong>
        <span>{t('banner.failedHint')}</span>
      </div>
    )
  }
  if (ticket.status === 'confirmed') {
    return (
      <div className="xui-notice ct-notice-success" role="status">
        {t('banner.confirmed', { time: formatTime(ticket.confirmedAt) })}
      </div>
    )
  }
  return (
    <div className="xui-notice" role="status">
      {t(ticket.status === 'pending_review' ? 'banner.pending_review' : 'banner.draft')}
    </div>
  )
}

function EvidenceChips({ evidence, onEvidence }: { evidence: Evidence[]; onEvidence: (ids: string[]) => void }) {
  const { t } = useServices()
  return (
    <span className="ct-evidence">
      {evidence.map((item) => (
        <button key={item.sentenceId} type="button" className="ct-chip" title={item.quote} onClick={() => onEvidence([item.sentenceId])}>
          {t('analysis.evidence', { id: item.sentenceId })}
        </button>
      ))}
    </span>
  )
}

function AnalysisSection({ analysis, onEvidence }: { analysis: ComplaintAnalysis; onEvidence: (ids: string[]) => void }) {
  const { t, formatTime } = useServices()
  return (
    <section className="ct-section">
      <header className="ct-section-head">
        <h2>{t('analysis.title')}</h2>
        <span className="ct-meta">{t('analysis.attempt', { attempt: analysis.attemptNo, time: formatTime(analysis.analyzedAt) })}</span>
      </header>
      <hr className="ct-divider" />
      <dl className="ct-facts">
        <dt>{t('analysis.category')}</dt>
        <dd>{t(`category.${analysis.category}`)}</dd>

        <dt>{t('analysis.severity')}</dt>
        <dd>
          <SeverityBadge severity={analysis.severity} />{' '}
          <span className="ct-meta">{t('severity.sla', { hours: SEVERITY_GUIDE[analysis.severity].responseWithinHours })}</span>
        </dd>

        <dt>{t('analysis.severityReason')}</dt>
        <dd>
          {analysis.severityReason} <EvidenceChips evidence={analysis.severityEvidence} onEvidence={onEvidence} />
        </dd>

        <dt>{t('analysis.sentiment')}</dt>
        <dd>{t(`sentiment.${analysis.sentiment}`)}</dd>

        <dt>{t('analysis.summary')}</dt>
        <dd>{analysis.summary}</dd>

        <dt>{t('analysis.demands')}</dt>
        <dd>
          {analysis.customerDemands.length ? (
            <ul className="ct-bullets">
              {analysis.customerDemands.map((demand) => (
                <li key={demand}>{demand}</li>
              ))}
            </ul>
          ) : (
            <span className="ct-meta">{t('analysis.noDemands')}</span>
          )}
        </dd>

        <dt>{t('analysis.facts')}</dt>
        <dd>
          <ul className="ct-bullets">
            {analysis.keyFacts.map((item) => (
              <li key={item.fact}>
                {item.fact}{' '}
                {item.evidenceVerified ? (
                  <EvidenceChips evidence={item.evidence} onEvidence={onEvidence} />
                ) : (
                  <span className="ct-pill ct-warning">{t('analysis.unverified')}</span>
                )}
              </li>
            ))}
          </ul>
        </dd>

        <dt>{t('analysis.actions')}</dt>
        <dd>
          <ol className="ct-bullets">
            {analysis.suggestedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </dd>

        <dt>{t('analysis.reply')}</dt>
        <dd className="ct-prewrap">{analysis.replyDraft}</dd>
      </dl>
      {analysis.unknownEvidenceIds.length ? <p className="ct-hint">{t('analysis.unknownIds', { ids: analysis.unknownEvidenceIds.join(', ') })}</p> : null}
    </section>
  )
}

function ResolutionSection({ ticket, resolution }: { ticket: TicketDetail; resolution: Resolution }) {
  const { t } = useServices()
  const suggested = ticket.analysis?.severity
  return (
    <section className="ct-section">
      <header className="ct-section-head">
        <h2>{t('review.final')}</h2>
      </header>
      <hr className="ct-divider" />
      <dl className="ct-facts">
        <dt>{t('review.category')}</dt>
        <dd>{t(`category.${resolution.category}`)}</dd>
        <dt>{t('review.severity')}</dt>
        <dd>
          <SeverityBadge severity={resolution.severity} />
          {suggested && suggested !== resolution.severity ? (
            <span className="ct-meta"> {t('review.changed', { from: suggested, to: resolution.severity })}</span>
          ) : null}
        </dd>
        <dt>{t('review.summary')}</dt>
        <dd>{resolution.summary}</dd>
        <dt>{t('review.handling')}</dt>
        <dd className="ct-prewrap">{resolution.handling}</dd>
        <dt>{t('review.reply')}</dt>
        <dd className="ct-prewrap">{resolution.replyDraft}</dd>
        {resolution.reviewerNote ? (
          <>
            <dt>{t('review.note')}</dt>
            <dd>{resolution.reviewerNote}</dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
