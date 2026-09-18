import * as React from 'react'
import { AlertTriangle, Badge, Button, ChevronDown, Collapsible, CollapsibleContent, CollapsibleTrigger, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FileText, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import type { Category, CreateTicketInput, Priority, TicketHistoryEntry, TicketStatus } from '../../src/domain/contracts'
import { type MessageKey, useI18n } from './i18n'

export const statusKeys: Record<TicketStatus, MessageKey> = { new: 'statusNew', processing: 'statusProcessing', pending_review: 'statusPending', confirmed: 'statusConfirmed', failed: 'statusFailed' }
export const categoryKeys: Record<Category, MessageKey> = { billing: 'categoryBilling', technical: 'categoryTechnical', account: 'categoryAccount', other: 'categoryOther' }
export const priorityKeys: Record<Priority, MessageKey> = { low: 'priorityLow', normal: 'priorityNormal', high: 'priorityHigh' }
const eventKeys: Record<TicketHistoryEntry['event'], MessageKey> = { created: 'eventCreated', analysis_started: 'eventStarted', analysis_saved: 'eventAnalyzed', analysis_failed: 'eventFailed', analysis_expired: 'eventExpired', confirmed: 'eventConfirmed' }
export function Status({ status }: { status: TicketStatus }) {
  const { t } = useI18n()
  return <Badge variant="outline" className={`status-badge status-${status}`}><span className="status-dot" aria-hidden="true" />{t(statusKeys[status])}</Badge>
}
export function ErrorNotice({ code, onRefresh }: { code: string; onRefresh: () => void }) {
  const { t } = useI18n()
  const map: Record<string, MessageKey> = { invalid_input: 'errorInvalid', conflict: 'errorConflict', idempotency_conflict: 'errorConflict', forbidden: 'errorPermission', not_found: 'errorNotFound', invalid_state: 'errorState', stale_attempt: 'errorState', attempt_expired: 'errorState', request_timeout: 'errorTimeout', assistant_unavailable: 'errorAssistant' }
  return <div className="notice notice-error" role="alert"><AlertTriangle className="size-4 shrink-0" /><p className="flex-1">{t(map[code] ?? 'errorConnection')}</p><Button variant="outline" size="sm" onClick={onRefresh}>{t('refresh')}</Button></div>
}
export function EmptyState({ title, hint, action }: { title: MessageKey; hint?: MessageKey; action?: React.ReactNode }) {
  const { t } = useI18n()
  return <div className="empty-state"><FileText className="size-9 text-muted-foreground" /><h2>{t(title)}</h2>{hint && <p>{t(hint)}</p>}{action}</div>
}
export function EnumSelect<T extends string>({ id, value, values, onChange, disabled = false }: { id: string; value: T; values: Record<T, MessageKey>; onChange: (value: T) => void; disabled?: boolean }) {
  const { t } = useI18n()
  return <Select value={value} disabled={disabled} onValueChange={next => { if (Object.hasOwn(values, next)) onChange(next as T) }}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(values) as T[]).map(key => <SelectItem key={key} value={key}>{t(values[key])}</SelectItem>)}</SelectContent></Select>
}
export function Activity({ entries }: { entries: TicketHistoryEntry[] }) {
  const { t, date } = useI18n()
  return <Collapsible className="activity"><CollapsibleTrigger className="section-toggle"><span>{t('history')}</span><ChevronDown className="size-4" /></CollapsibleTrigger><CollapsibleContent><ol>{[...entries].reverse().map((entry, i) => <li key={`${entry.revision}-${i}`}><span className="activity-dot" /><div><p>{t(eventKeys[entry.event])}</p><span>{t({ human: 'actorHuman', agent: 'actorAgent', system: 'actorSystem' }[entry.actor] as MessageKey)} · {date(entry.at)}</span></div></li>)}</ol></CollapsibleContent></Collapsible>
}
export function CreateTicket({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (value: CreateTicketInput) => Promise<boolean> }) {
  const { t } = useI18n()
  const [title, setTitle] = React.useState('')
  const [customerAlias, setAlias] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [validation, setValidation] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const requestId = React.useRef(crypto.randomUUID())
  React.useEffect(() => { if (open) { requestId.current = crypto.randomUUID(); setTitle(''); setAlias(''); setMessage(''); setValidation(false); setFailed(false) } }, [open])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !customerAlias.trim() || !message.trim()) { setValidation(true); return }
    setFailed(false)
    setFailed(!await onCreate({ requestId: requestId.current, title: title.trim(), customerAlias: customerAlias.trim(), message: message.trim() }))
  }
  return <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose() }}><DialogContent className="create-dialog" showCloseButton={false}><DialogHeader><DialogTitle>{t('createTitle')}</DialogTitle><DialogDescription>{t('createHint')}</DialogDescription></DialogHeader><form noValidate onSubmit={submit}><div className="form-fields"><div className="field"><label htmlFor="create-title">{t('title')} <span aria-hidden="true">*</span></label><Input autoFocus id="create-title" value={title} onChange={event => { setTitle(event.target.value); setValidation(false); setFailed(false) }} placeholder={t('titlePlaceholder')} maxLength={120} required aria-invalid={validation && !title.trim()} /></div><div className="field"><label htmlFor="create-customer">{t('customer')} <span aria-hidden="true">*</span></label><Input id="create-customer" value={customerAlias} onChange={event => { setAlias(event.target.value); setValidation(false); setFailed(false) }} placeholder={t('aliasPlaceholder')} maxLength={80} required aria-invalid={validation && !customerAlias.trim()} /></div><div className="field"><label htmlFor="create-message">{t('message')} <span aria-hidden="true">*</span></label><Textarea id="create-message" className="min-h-44" value={message} onChange={event => { setMessage(event.target.value); setValidation(false); setFailed(false) }} placeholder={t('messagePlaceholder')} maxLength={12000} required aria-invalid={validation && !message.trim()} /><span className="field-count">{t('fieldCount', { count: message.length, max: 12000 })}</span></div>{failed && <p className="text-destructive text-sm" role="alert">{t('errorConnection')}</p>}{validation && <p className="text-destructive text-sm" role="alert">{t('validation')}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('cancel')}</Button><Button type="submit" disabled={busy}>{busy ? t('confirming') : t('createSave')}</Button></DialogFooter></form></DialogContent></Dialog>
}
