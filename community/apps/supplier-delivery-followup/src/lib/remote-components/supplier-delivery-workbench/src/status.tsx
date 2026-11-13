import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  LoaderCircle,
  MessageCircleQuestion,
  TriangleAlert,
  type LucideIcon
} from 'lucide-react'
import { React } from './vendor'
import type { ReplyStatus } from '../../../workbench-contract'
import { t, type MessageKey } from './i18n'

export type Tone = 'neutral' | 'active' | 'review' | 'success' | 'warning' | 'danger'

/** Text color plus a soft surface, all from host semantic tokens. */
export const toneClass: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  active: 'text-primary',
  review: 'text-primary',
  success: 'text-[color:var(--status-success)]',
  warning: 'text-[color:var(--status-warning)]',
  danger: 'text-destructive'
}

export const toneSurface: Record<Tone, string> = {
  neutral: 'bg-muted',
  active: 'bg-primary/5',
  review: 'bg-primary/5',
  success: 'bg-[color:var(--status-success-background)]',
  warning: 'bg-[color:var(--status-warning-background)]',
  danger: 'bg-[color:var(--status-destructive-background)]'
}

interface StatusMeta {
  label: MessageKey
  icon: LucideIcon
  tone: Tone
  spinning?: boolean
}

/** One status vocabulary for the whole view. A parse that ran past the timeout is shown as incomplete. */
export function replyStatusMeta(status: ReplyStatus, timedOut: boolean): StatusMeta {
  if (status === 'parsing' && timedOut) return { label: 'status.parseIncomplete', icon: TriangleAlert, tone: 'warning' }
  switch (status) {
    case 'received':
      return { label: 'status.received', icon: CircleDashed, tone: 'neutral' }
    case 'parsing':
      return { label: 'status.parsing', icon: LoaderCircle, tone: 'active', spinning: true }
    case 'pending_review':
      return { label: 'status.pending_review', icon: ClipboardCheck, tone: 'review' }
    case 'confirmed':
      return { label: 'status.confirmed', icon: CircleCheck, tone: 'success' }
    case 'needs_followup':
      return { label: 'status.needs_followup', icon: MessageCircleQuestion, tone: 'warning' }
    case 'failed':
      return { label: 'status.failed', icon: CircleX, tone: 'danger' }
  }
}

export function ReplyStatus({
  status,
  timedOut,
  className = ''
}: {
  status: ReplyStatus
  timedOut: boolean
  className?: string
}) {
  const meta = replyStatusMeta(status, timedOut)
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${toneClass[meta.tone]} ${className}`}>
      <Icon aria-hidden className={`size-3.5 shrink-0 ${meta.spinning ? 'motion-safe:animate-spin' : ''}`} />
      {t(meta.label)}
    </span>
  )
}

/** Delay relative to the original commitment, as plain text with a semantic tone. */
export function DelayLabel({ days, className = '' }: { days: number; className?: string }) {
  if (days === 0) return <span className={`text-xs text-muted-foreground ${className}`}>{t('delay.onTime')}</span>
  const late = days > 0
  return (
    <span className={`text-xs font-medium tabular-nums ${late ? toneClass.warning : toneClass.success} ${className}`}>
      {late ? t('delay.later', { days }) : t('delay.earlier', { days: Math.abs(days) })}
    </span>
  )
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
