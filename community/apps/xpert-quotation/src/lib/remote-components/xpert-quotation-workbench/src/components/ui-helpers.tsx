import * as React from 'react'
import { Check, EyeOff } from 'lucide-react'
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn
} from '@xpert-ai/plugin-shadcn-ui'
import type { MatchStatus, Line } from '../view-data'
import { statusLabel, type Translate } from '../presentation'

export function IconButton({ label, children, className, ...props }: Omit<React.ComponentProps<typeof Button>, 'children'> & {
  label: string
  children: React.ReactNode
}) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        className={cn('cursor-pointer transition-colors', className)}
        {...props}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
}

export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return <div className="grid min-h-80 place-content-center justify-items-center gap-3 p-6 text-center text-muted-foreground">
    <div className="grid size-12 place-items-center rounded-xl border border-border bg-muted/50 text-foreground">
      {icon}
    </div>
    <strong className="text-sm font-semibold text-foreground">{title}</strong>
    {description && <p className="max-w-lg text-xs leading-5">{description}</p>}
    {action}
  </div>
}

export function SectionHeading({ step, title, description, actions }: {
  step: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return <header className="flex flex-wrap items-start justify-between gap-3">
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2">
      <span className="text-[10px] font-extrabold tracking-[0.12em] text-primary">{step}</span>
      <strong className="text-sm font-semibold text-foreground">{title}</strong>
      {description && <small className="col-start-2 mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</small>}
    </div>
    {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
  </header>
}

export function StatusBadge({ status, t }: { status: string; t: Translate }) {
  return <Badge variant="outline" className="gap-1">
    {status === 'applied' ? <Check aria-hidden className="size-3"/> : status === 'review_required' ? <EyeOff aria-hidden className="size-3"/> : null}
    {statusLabel(status, t)}
  </Badge>
}

export function LineStatus({ status, reviewState, t }: {
  status: MatchStatus
  reviewState?: Line['reviewState']
  t: Translate
}) {
  const label = reviewState === 'approved' ? t('reviewed') : statusLabel(status, t)
  const tone = status === 'review_required'
    ? 'border-warning/30 bg-warning/10 text-warning'
    : status === 'unmatched'
      ? 'border-destructive/30 bg-destructive-background text-destructive'
      : status === 'ignored'
        ? 'border-border bg-muted text-muted-foreground'
        : 'border-success/30 bg-success-background text-success'
  return <Badge variant="outline" className={cn('ml-auto gap-1', tone)}>
    {(status === 'confirmed' || reviewState === 'approved') && <Check aria-hidden className="size-3"/>}
    {label}
  </Badge>
}
