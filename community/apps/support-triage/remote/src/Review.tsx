import { Badge, Bot, Button, Check, ChevronDown, ClipboardList, Collapsible, CollapsibleContent, CollapsibleTrigger, RefreshCw, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import type { Category, Priority, TicketDetail } from '../../src/domain/contracts'
import { Activity, categoryKeys, EnumSelect, priorityKeys, Status } from './components'
import { type MessageKey, useI18n } from './i18n'

export interface Draft { category: Category; priority: Priority; reply: string }
export function draftFrom(ticket: TicketDetail): Draft {
  return { category: ticket.category ?? ticket.analysis?.category ?? 'other', priority: ticket.priority ?? ticket.analysis?.priority ?? 'normal', reply: ticket.confirmedReply ?? ticket.analysis?.replyDraft ?? '' }
}
export function Review({ ticket, draft, dirty, busy, changed, setDraft, onAnalyze, onAbort, onSave, onReload }: { ticket: TicketDetail; draft: Draft; dirty: boolean; busy: boolean; changed: boolean; setDraft: (value: Draft) => void; onAnalyze: () => void; onAbort: () => void; onSave: () => void; onReload: () => void }) {
  const { t, date } = useI18n()
  const analysis = ticket.analysis
  const editable = ticket.status === 'pending_review'
  const processing = ticket.status === 'processing'
  const complete = ticket.status === 'confirmed'
  const step = complete ? 3 : editable ? 2 : processing ? 1 : 0
  const steps: MessageKey[] = ['stepInput', 'stepAI', 'stepReview', 'stepSaved']
  return <div className="ticket-workspace" data-testid="ticket-workspace">
    <header className="ticket-heading"><div className="min-w-0"><div className="ticket-meta"><span className="font-mono">{t('ticketId', { id: ticket.id.slice(0, 8).toUpperCase() })}</span><Status status={ticket.status} /></div><h2>{ticket.title}</h2><p>{ticket.customerAlias}<span>·</span>{t('updated', { time: date(ticket.updatedAt) })}</p></div></header>
    <ol className="workflow-steps" aria-label={t('review')}>{steps.map((label, i) => <li key={label} data-active={i === step} data-done={i < step}><span>{i < step ? <Check className="size-3" /> : i + 1}</span>{t(label)}</li>)}</ol>
    {changed && <div className="notice notice-warning" role="status"><p className="flex-1">{t('remoteChanged')}</p><Button size="sm" variant="outline" onClick={onReload}>{t('loadLatest')}</Button></div>}
    <div className="review-grid">
      <section className="source-pane"><div className="pane-heading"><h3><ClipboardList className="size-4" />{t('original')}</h3><span>{t('requestRecorded')}</span></div><div className="pane-body"><div className="original-message" data-testid="original-message">{ticket.message}</div>{analysis && <div className="evidence-section"><h4>{t('evidence')}<Badge variant="secondary">{t('countEvidence', { count: analysis.evidence.length })}</Badge></h4><p className="text-xs text-muted-foreground mb-3">{t('evidenceHint')}</p>{analysis.evidence.map((quote, index) => <blockquote key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{quote}</p></blockquote>)}</div>}<Activity entries={ticket.history} /></div></section>
      <section className="review-pane"><div className="pane-heading"><h3><Bot className="size-4" />{t('review')}</h3><span>{t('revision', { revision: ticket.revision })}</span></div><div className="pane-body">
        {processing ? <div className="analysis-state" role="status"><RefreshCw className="size-7 animate-spin text-primary" /><h3>{t('processing')}</h3><p>{t('processingHint')}</p>{ticket.attemptDeadline && <span className="text-xs text-muted-foreground">{t('deadline', { time: date(ticket.attemptDeadline) })}</span>}<Button variant="outline" onClick={onAbort} disabled={busy}>{t('abort')}</Button></div> : !analysis ? <div className="analysis-state"><Bot className="size-8 text-muted-foreground" /><h3>{t(ticket.status === 'failed' ? 'failedTitle' : 'waitingTitle')}</h3><p>{t(ticket.status === 'failed' ? 'failedHint' : 'waitingHint')}</p>{ticket.failureReason && <div className="failure-detail" role="status">{ticket.failureReason}</div>}<Button onClick={onAnalyze} disabled={busy}><Bot />{t(ticket.status === 'failed' ? 'retry' : 'analyze')}</Button></div> : <>
          <section className="summary-section"><div className="eyebrow">{t('aiSummary')}</div><p>{analysis.summary}</p></section>
          <div className="triage-fields"><div className="field"><label htmlFor="review-category">{t('category')}</label><EnumSelect id="review-category" value={draft.category} values={categoryKeys} onChange={category => setDraft({ ...draft, category })} disabled={!editable || busy} /></div><div className="field"><label htmlFor="review-priority">{t('priority')}</label><EnumSelect id="review-priority" value={draft.priority} values={priorityKeys} onChange={priority => setDraft({ ...draft, priority })} disabled={!editable || busy} /></div></div>
          <Collapsible className="rationale-section"><CollapsibleTrigger className="section-toggle"><span>{t('rationale')}</span><ChevronDown className="size-4" /></CollapsibleTrigger><CollapsibleContent><p>{analysis.rationale}</p></CollapsibleContent></Collapsible>
          <section className="missing-section"><h4>{t('missing')}</h4>{analysis.missingInfo.length ? <ul>{analysis.missingInfo.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{t('noMissing')}</p>}</section>
          <div className="field reply-field"><div className="reply-label"><label htmlFor="review-reply">{t('reply')}</label><span className={dirty ? 'text-warning' : 'text-muted-foreground'}>{t(complete ? 'confirmed' : dirty ? 'dirty' : 'clean')}</span></div><Textarea id="review-reply" data-testid="reply-editor" value={draft.reply} onChange={event => setDraft({ ...draft, reply: event.target.value })} readOnly={!editable} disabled={busy} maxLength={4000} className="reply-editor" /><span className="field-count">{t('fieldCount', { count: draft.reply.length, max: 4000 })}</span></div>
          {complete && <div className="saved-banner"><Check className="size-4" /><div><strong>{t('savedHint')}</strong>{ticket.confirmedAt && <p>{t('reviewSavedAt', { time: date(ticket.confirmedAt) })}</p>}</div></div>}
        </>}
      </div>{analysis && !processing && <footer className="review-footer"><p>{t('replyHint')}</p>{editable && <Button onClick={onSave} disabled={busy || changed || !draft.reply.trim()}><Check />{t(busy ? 'confirming' : 'confirm')}</Button>}</footer>}</section>
    </div>
  </div>
}
