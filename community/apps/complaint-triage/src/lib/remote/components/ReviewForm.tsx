import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ComplaintAnalysis, Resolution } from '../../domain/contracts.js'
import { CATEGORIES, SEVERITIES, SEVERITY_GUIDE } from '../../domain/policy.js'
import type { Category, Severity } from '../../domain/policy.js'
import { useServices } from '../context.js'

interface Props {
  analysis: ComplaintAnalysis
  submitting: boolean
  onConfirm: (resolution: Resolution) => void
}

// The reviewer starts from the AI suggestion and owns every field: nothing is final until they save.
export function ReviewForm({ analysis, submitting, onConfirm }: Props) {
  const { t } = useServices()
  const [category, setCategory] = useState<Category>(analysis.category)
  const [severity, setSeverity] = useState<Severity>(analysis.severity)
  const [summary, setSummary] = useState(analysis.summary)
  const [handling, setHandling] = useState(analysis.suggestedActions.map((action, index) => `${index + 1}. ${action}`).join('\n'))
  const [replyDraft, setReplyDraft] = useState(analysis.replyDraft)
  const [reviewerNote, setReviewerNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim() || !handling.trim() || !replyDraft.trim()) {
      setError(t('review.required'))
      return
    }
    setError(null)
    onConfirm({
      category,
      severity,
      summary: summary.trim(),
      handling: handling.trim(),
      replyDraft: replyDraft.trim(),
      ...(reviewerNote.trim() ? { reviewerNote: reviewerNote.trim() } : {})
    })
  }

  return (
    <form className="ct-review" onSubmit={submit} noValidate>
      <div className="ct-review-grid">
        <div className="xui-field">
          <label htmlFor="ct-review-category">{t('review.category')}</label>
          <select id="ct-review-category" className="xui-control" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`category.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="xui-field">
          <label htmlFor="ct-review-severity">{t('review.severity')}</label>
          <select id="ct-review-severity" className="xui-control" value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {t(`severity.${value}`)} · {t('severity.sla', { hours: SEVERITY_GUIDE[value].responseWithinHours })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="xui-field">
        <label htmlFor="ct-review-summary">{t('review.summary')}</label>
        <textarea id="ct-review-summary" className="xui-textarea" value={summary} onChange={(event) => setSummary(event.target.value)} />
      </div>
      <div className="xui-field">
        <label htmlFor="ct-review-handling">{t('review.handling')}</label>
        <textarea id="ct-review-handling" className="xui-textarea ct-tall" value={handling} onChange={(event) => setHandling(event.target.value)} />
      </div>
      <div className="xui-field">
        <label htmlFor="ct-review-reply">{t('review.reply')}</label>
        <textarea id="ct-review-reply" className="xui-textarea ct-tall" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} />
      </div>
      <div className="xui-field">
        <label htmlFor="ct-review-note">{t('review.note')}</label>
        <input id="ct-review-note" className="xui-input" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} />
      </div>
      {error ? (
        <div className="xui-notice xui-notice-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="ct-review-actions">
        <button type="submit" className="xui-button xui-button-primary" disabled={submitting}>
          {t('review.submit')}
        </button>
      </div>
    </form>
  )
}
