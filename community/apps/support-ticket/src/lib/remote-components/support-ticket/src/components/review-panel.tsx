import { React } from '../vendor'
import { cx, formatDateTime, optionLabel } from '../utils'
import { SUPPORT_TICKET_ACTIONS, SUPPORT_TICKET_STATUSES } from '../../../../constants'
import type { Text } from '../i18n'
import type { TicketCategory, TicketDetail, TicketOption, TicketPriority } from '../types'

const { useEffect, useState } = React

export interface ReviewPayload {
  expectedRevision: number
  category: TicketCategory
  priority: TicketPriority
  draftReply: string
}

export interface PanelAlert {
  code?: string
  message: string
}

interface ReviewPanelProps {
  t: Text
  locale: string
  item: TicketDetail
  categories: TicketOption[]
  priorities: TicketOption[]
  channels: TicketOption[]
  busyAction: string | null
  waitingSeconds: number | null
  timeoutSeconds: number
  alert: PanelAlert | null
  onSaveDraft: (payload: ReviewPayload) => void
  onConfirm: (payload: ReviewPayload) => void
  onRetry: () => void
  onMarkFailed: () => void
}

export function ReviewPanel(props: ReviewPanelProps) {
  const { t, locale, item, categories, priorities, channels, busyAction, waitingSeconds, timeoutSeconds, alert } = props
  const [category, setCategory] = useState<TicketCategory>('other')
  const [priority, setPriority] = useState<TicketPriority>('p2')
  const [reply, setReply] = useState('')
  const [validated, setValidated] = useState(false)

  /** Re-seed the editable copy only when the persisted revision changes, so a rejected save keeps the reviewer edits. */
  useEffect(() => {
    setCategory((item.confirmed?.category ?? item.ai?.category ?? 'other') as TicketCategory)
    setPriority((item.confirmed?.priority ?? item.ai?.priority ?? 'p2') as TicketPriority)
    setReply(item.confirmed?.draftReply ?? item.ai?.draftReply ?? '')
    setValidated(false)
  }, [item.id, item.revision])

  const isConfirmed = item.status === 'confirmed'
  const isProcessing = item.status === 'processing'
  const canReview = Boolean(item.ai) && !isConfirmed
  const replyError = validated && !reply.trim() ? t('required') : ''
  const categoryEdited = Boolean(item.confirmed && item.ai && item.confirmed.category && item.confirmed.category !== item.ai.category)
  const replyEdited = Boolean(item.confirmed && item.ai && item.confirmed.draftReply && item.confirmed.draftReply !== item.ai.draftReply)

  const submit = (handler: (payload: ReviewPayload) => void) => () => {
    setValidated(true)
    if (!reply.trim()) {
      return
    }
    handler({
      expectedRevision: item.revision,
      category,
      priority,
      draftReply: reply.trim()
    })
  }

  return (
    <div className="st-panel">
      <section className="st-section">
        <div className="st-section-head">
          <div>
            <div className="st-section-title st-mono">
              {item.ticketNo} · {item.customerName}
            </div>
            <div className="st-section-hint">
              {optionLabel(channels, item.channel, locale)} · {t('attempt', { count: item.attemptCount })} ·{' '}
              {t('revision', { revision: item.revision })} · {formatDateTime(item.updatedAt ?? item.createdAt, locale)}
            </div>
          </div>
          <span className={cx('st-tag', `st-tag-${item.status}`)}>
            {optionLabel(SUPPORT_TICKET_STATUSES, item.status, locale)}
          </span>
        </div>

        {alert ? (
          <div className={cx('st-alert', alert.code === 'revision_conflict' ? 'st-alert-warning' : 'st-alert-error')}>
            <div>
              <strong>{alert.code ? t(`code_${alert.code}`) : t('failureTitle')}</strong>
              <span>{alert.message}</span>
            </div>
          </div>
        ) : null}

        {item.status === 'failed' ? (
          <div className="st-alert st-alert-error" style={{ marginTop: alert ? 10 : 0 }}>
            <div style={{ flex: 1 }}>
              <strong>{t('failureTitle')}</strong>
              <span>{item.failure?.reason}</span>
              <div className="st-section-hint">{t('failureHint')}</div>
            </div>
            <button type="button" className="st-btn st-btn-primary st-btn-sm" disabled={Boolean(busyAction)} onClick={props.onRetry}>
              {busyAction === SUPPORT_TICKET_ACTIONS.retryTicket ? t('retrying') : t('retry')}
            </button>
          </div>
        ) : null}

        {isProcessing ? (
          <div>
            <div className="st-skeleton st-skeleton-line" style={{ width: '42%' }} />
            <div className="st-skeleton st-skeleton-line" style={{ width: '78%' }} />
            <div className="st-skeleton st-skeleton-line" style={{ width: '64%' }} />
            <div className="st-section-hint">
              {waitingSeconds === null
                ? t('waitingForTool')
                : t('aiPendingHint', { seconds: waitingSeconds, timeout: timeoutSeconds })}
            </div>
            <div className="st-actions" style={{ marginTop: 10 }}>
              <button type="button" className="st-btn st-btn-ghost st-btn-sm" disabled={Boolean(busyAction)} onClick={props.onMarkFailed}>
                {t('markFailed')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="st-section">
        <div className="st-section-head">
          <div className="st-section-title">{t('message')}</div>
        </div>
        <div className="st-reply">{item.originalMessage}</div>
      </section>

      {item.ai ? (
        <section className="st-section">
          <div className="st-section-head">
            <div className="st-section-title">{t('aiSection')}</div>
            <div className="st-section-hint">{formatDateTime(item.ai.processedAt, locale)}</div>
          </div>
          <div className="st-result-grid">
            <div className="st-kv">
              <div className="st-kv-label">{t('category')}</div>
              <div className="st-kv-value">
                {optionLabel(categories, item.ai.category, locale)}
                {categoryEdited ? <span className="st-tag st-tag-pending_review" style={{ marginLeft: 8 }}>{t('edited')}</span> : null}
              </div>
            </div>
            <div className="st-kv">
              <div className="st-kv-label">{t('priority')}</div>
              <div className="st-kv-value">{optionLabel(priorities, item.ai.priority, locale)}</div>
            </div>
          </div>
          <div className="st-field" style={{ marginTop: 12 }}>
            <div className="st-kv-label">{t('priorityEvidence')}</div>
            <div className="st-quote">{item.ai.priorityReason}</div>
          </div>
          <div className="st-field">
            <div className="st-kv-label">{t('draftReply')}</div>
            <div className="st-reply">{item.ai.draftReply}</div>
          </div>
          {item.ai.missingInfo?.length ? (
            <div className="st-field">
              <div className="st-kv-label">{t('missingInfo')}</div>
              <div className="st-quote">{item.ai.missingInfo.join('、')}</div>
            </div>
          ) : null}
          {typeof item.ai.confidence === 'number' ? (
            <div className="st-section-hint">
              {t('confidence')}: {Math.round(item.ai.confidence * 100)}%
            </div>
          ) : null}
        </section>
      ) : null}

      {canReview ? (
        <section className="st-section">
          <div className="st-section-head">
            <div>
              <div className="st-section-title">{t('reviewSection')}</div>
              <div className="st-section-hint">{t('reviewerHint')}</div>
            </div>
          </div>
          <div className="st-row">
            <div className="st-field">
              <label className="st-label" htmlFor="st-review-category">
                {t('category')}
              </label>
              <select
                id="st-review-category"
                className="st-select"
                value={category}
                onChange={(event: { target: { value: string } }) => setCategory(event.target.value as TicketCategory)}
              >
                {categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === 'en-US' ? option.en_US : option.zh_Hans}
                  </option>
                ))}
              </select>
            </div>
            <div className="st-field">
              <label className="st-label" htmlFor="st-review-priority">
                {t('priority')}
              </label>
              <select
                id="st-review-priority"
                className="st-select"
                value={priority}
                onChange={(event: { target: { value: string } }) => setPriority(event.target.value as TicketPriority)}
              >
                {priorities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === 'en-US' ? option.en_US : option.zh_Hans}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="st-field">
            <label className="st-label" htmlFor="st-review-reply">
              {t('draftReply')} <b>*</b>
            </label>
            <textarea
              id="st-review-reply"
              className="st-textarea"
              style={{ minHeight: 140 }}
              value={reply}
              onChange={(event: { target: { value: string } }) => setReply(event.target.value)}
            />
            {replyError ? <div className="st-error">{replyError}</div> : null}
          </div>
          <div className="st-actions">
            <button
              type="button"
              className="st-btn st-btn-primary"
              disabled={Boolean(busyAction)}
              onClick={submit(props.onConfirm)}
              title={item.ai ? undefined : t('confirmNeedsAi')}
            >
              {busyAction === SUPPORT_TICKET_ACTIONS.confirmTicket ? t('confirming') : t('confirm')}
            </button>
            <button
              type="button"
              className="st-btn st-btn-ghost"
              disabled={Boolean(busyAction)}
              onClick={submit(props.onSaveDraft)}
            >
              {busyAction === SUPPORT_TICKET_ACTIONS.saveDraft ? t('saving') : t('saveDraft')}
            </button>
          </div>
        </section>
      ) : null}

      {isConfirmed ? (
        <section className="st-section">
          <div className="st-section-head">
            <div className="st-section-title">{t('finalReply')}</div>
            <div className="st-section-hint">
              {replyEdited ? t('edited') : t('untouched')} · {formatDateTime(item.confirmed?.reviewedAt, locale)}
            </div>
          </div>
          <div className="st-result-grid" style={{ marginBottom: 12 }}>
            <div className="st-kv">
              <div className="st-kv-label">{t('category')}</div>
              <div className="st-kv-value">{optionLabel(categories, item.confirmed?.category, locale)}</div>
            </div>
            <div className="st-kv">
              <div className="st-kv-label">{t('priority')}</div>
              <div className="st-kv-value">{optionLabel(priorities, item.confirmed?.priority, locale)}</div>
            </div>
          </div>
          <div className="st-reply">{item.confirmed?.draftReply}</div>
        </section>
      ) : null}

      <section className="st-section">
        <div className="st-section-head">
          <div className="st-section-title">{t('timeline')}</div>
        </div>
        <div className="st-timeline">
          {item.events.map((event, index) => (
            <div className="st-timeline-item" key={`${event.action}-${index}`}>
              <span className="st-dot" />
              <span style={{ flex: 1 }}>
                {t(`event_${event.action}`)}
                {event.detail ? ` · ${event.detail}` : ''}
              </span>
              <span>{formatDateTime(event.at, locale)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
