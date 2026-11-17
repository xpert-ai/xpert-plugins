import React from 'react'
import { Button, Input } from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'

export const i18n = createRemoteI18n({ en, 'zh-Hans': zh })

function RiskTimer({ risk, busy, closed, submit }) {
  React.useSyncExternalStore(i18n.subscribe, i18n.getLocale)
  const {
    state,
    version,
    dueAt,
    wakeStatus,
    quoteRevision,
    quoteVersionStatus,
    reminderId,
    publishedAt,
    workbenchPublication,
    replyNote
  } = risk.followUp
  const [date, setDate] = React.useState('')
  const [note, setNote] = React.useState('')
  const due = date ? new Date(date) : null
  const active = ['waiting', 'captured', 'fired'].includes(state)
  const edit = (action, fields) => submit({ riskId: risk.id, expectedVersion: version, action, ...fields })
  return (
    <section>
      <p>
        {i18n.t(state)}
        {dueAt && ' · ' + i18n.date(dueAt, { dateStyle: 'short', timeStyle: 'short' })}
      </p>
      {quoteRevision != null && <p>{i18n.t('quoteRevision', { revision: i18n.number(quoteRevision) })}</p>}
      {reminderId && publishedAt && (
        <p>
          {i18n.t('publishedCheck', {
            date: i18n.date(publishedAt, { dateStyle: 'short', timeStyle: 'short' })
          })}
        </p>
      )}
      {quoteVersionStatus === 'unverified' && <p>{i18n.t('unverifiedQuoteVersion')}</p>}
      {quoteVersionStatus !== 'unverified' && workbenchPublication === 'unknown' && (
        <p>{i18n.t('unverifiedPublication')}</p>
      )}
      {replyNote && <p>{i18n.t('recordedReply', { note: replyNote })}</p>}
      {wakeStatus && <p>{i18n.t(wakeStatus === 'started' ? 'wakeStarted' : 'wakeQueued')}</p>}
      {active && !closed && <p>{i18n.t(state === 'fired' ? 'cancelCommittedHelp' : 'cancelPendingHelp')}</p>}
      {!closed && !['superseded', 'answered'].includes(state) && (
        <>
          {(!quoteVersionStatus || quoteVersionStatus === 'current') && (
            <>
              <Input
                type="datetime-local"
                aria-label={i18n.t('deadline')}
                value={date}
                disabled={busy}
                onChange={(event) => setDate(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || !due || !(due > new Date())}
                onClick={() => edit('set', { dueAt: due.toISOString() })}
              >
                {i18n.t(active ? 'reschedule' : 'set')}
              </Button>
            </>
          )}
          {active && (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => edit('cancel')}>
                {i18n.t('cancel')}
              </Button>
              <Input
                aria-label={i18n.t('note')}
                placeholder={i18n.t('note')}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => edit('reply', note.trim() ? { replyNote: note.trim() } : {})}
              >
                {i18n.t('reply')}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  )
}
export function Controls(props) {
  return (
    <RemoteI18nProvider i18n={i18n}>
      <RiskTimer {...props} />
    </RemoteI18nProvider>
  )
}

export function Decisions({ management, busy, closed, runAction }) {
  React.useSyncExternalStore(i18n.subscribe, i18n.getLocale)
  const ids = React.useRef(new Map())
  function submit(request, choice) {
    const key = [request.id, request.version, choice].join('/')
    if (!ids.current.has(key)) ids.current.set(key, crypto.randomUUID())
    return runAction('submit_delay_decision', {
      requestId: request.id,
      requestVersion: request.version,
      schemaVersion: 1,
      sourceRevision: String(request.revision),
      choice,
      commandId: ids.current.get(key)
    })
  }
  const byId = new Map(management.requests.map((r) => [r.id, r]))
  return (
    <RemoteI18nProvider i18n={i18n}>
      <section>
        <h3>{i18n.t('buyerDecisions')}</h3>
        <Button
          variant="outline"
          disabled={busy || closed}
          onClick={() => runAction('set_delay_decisions', { enabled: !management.enabled })}
        >
          {i18n.t(management.enabled ? 'disableDecisions' : 'enableDecisions')}
        </Button>
        {management.requests.map((r) => (
          <article key={r.id}>
            <strong>{r.supplier}</strong>
            <p>
              {i18n.t('quoteRevision', { revision: i18n.number(r.revision) })} · {r.originalDate} → {r.revisedDate}
            </p>
            {byId.has(r.replaces) && (
              <p>
                {i18n.t('replacedQuote', {
                  revision: i18n.number(byId.get(r.replaces).revision),
                  date: byId.get(r.replaces).revisedDate
                })}
              </p>
            )}
            <p>
              {i18n.t('decision_' + r.state)}{' '}
              {r.decidedAt && i18n.date(r.decidedAt, { dateStyle: 'short', timeStyle: 'short' })} {r.decidedBy}
            </p>
            {management.enabled &&
              !closed &&
              r.state === 'pending' &&
              management.choices.map((choice) => (
                <Button key={choice} variant="outline" disabled={busy} onClick={() => submit(r, choice)}>
                  {i18n.t(choice)}
                </Button>
              ))}
          </article>
        ))}
      </section>
    </RemoteI18nProvider>
  )
}

export function SeriesReviews({ reviews, caseId, busy, closed, runAction }) {
  React.useSyncExternalStore(i18n.subscribe, i18n.getLocale)
  return (
    <RemoteI18nProvider i18n={i18n}>
      <section>
        <h3>{i18n.t('seriesReviewTitle')}</h3>
        {reviews.map(review => (
          <article key={review.requestId}>
            <strong>{review.file}</strong>
            <p>{review.supplier} · {review.proposedDate}</p>
            <p>{i18n.t('seriesConflict', { series: review.requestedSeries })}</p>
            {review.candidates.length === 0 && <p>{i18n.t('seriesNoCandidates')}</p>}
            {review.candidates.map(candidate => (
              <div key={candidate.seriesId}>
                <p>{candidate.supplier} · {candidate.file} · {candidate.seriesId}</p>
                <Button variant="outline" disabled={busy || closed}
                  aria-label={i18n.t('confirmSeriesLabel', { file: candidate.file, series: candidate.seriesId })}
                  onClick={() => runAction('confirm_quote_series', {
                    caseId, documentId: review.documentId, requestId: review.requestId, seriesId: candidate.seriesId
                  })}>{i18n.t('confirmSeries')}</Button>
              </div>
            ))}
          </article>
        ))}
      </section>
    </RemoteI18nProvider>
  )
}
