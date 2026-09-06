import * as React from 'react'
import {
  Badge,
  Button,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@xpert-ai/plugin-shadcn-ui'
import type { ExecutionRecord } from '../../../contracts'
import { statusKey, useI18n } from './i18n'
import { navigate } from './bridge'
import { Info } from 'lucide-react'

// Hover, keyboard focus, and tap reveal the same optional context.
export function ContextDisclosure({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={0}>
      <HoverCardTrigger asChild>
        {/* Native anchor retains a DOM ref in the host React 18 runtime. */}
        <span className="inline-flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-expanded={open}
            aria-describedby={open ? id : undefined}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
          >
            <Info size={15} />
          </Button>
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        id={id}
        align="start"
        className="context-disclosure space-y-3"
      >
        {children}
      </HoverCardContent>
    </HoverCard>
  )
}
export function Status({ value }: { value: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="outline" className={`status-${value}`}>
      {t(statusKey[value] ?? 'status')}
    </Badge>
  )
}
export function ExecutionMarkers({
  records,
  onError,
}: {
  records: ExecutionRecord[]
  onError: (error: Error) => void
}) {
  const { t, date } = useI18n()
  const [history, setHistory] = React.useState(false)
  const open = async (r: ExecutionRecord) => {
    try {
      if (!r.conversationId) throw new Error(t('executionUnavailable'))
      await navigate({
        target: 'assistant.conversation',
        selectionId: r.caseId,
        conversationId: r.conversationId,
        ...(r.threadId ? { threadId: r.threadId } : {}),
        ...(r.executionId ? { executionId: r.executionId } : {}),
      })
    } catch (e) {
      onError(e instanceof Error ? e : new Error(t('error')))
    }
  }
  if (!records.length) return null
  return (
    <div
      className="execution-markers"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {records.length > 10 && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('history')}
          onClick={() => setHistory(true)}
        >
          +{records.length - 10}
        </Button>
      )}
      {records.slice(-10).map((r) => (
        <HoverCard key={r.id} openDelay={120}>
          <HoverCardTrigger asChild>
            {/* Native anchor retains a DOM ref in the host React 18 runtime. */}
            <span className="inline-flex shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="execution-hit"
                aria-label={`${t('openExecution')} · ${t(statusKey[r.status]!)} · ${r.attempt}`}
                data-testid={`execution-${r.nodeKey}-${r.id}`}
                onClick={() => void open(r)}
              >
                <span className={`execution-dot status-${r.status}`} />
              </Button>
            </span>
          </HoverCardTrigger>
          <HoverCardContent align="end" className="w-80 space-y-2">
            <div className="flex justify-between">
              <strong>{t('execution')}</strong>
              <Status value={r.status} />
            </div>
            <p className="text-sm">{r.safeSummary}</p>
            <dl className="text-xs text-muted-foreground space-y-1">
              <div>
                {t('attempt')} {r.attempt} · {t('revision')} {r.inputRevision} →{' '}
                {r.outputRevision ?? '—'}
              </div>
              <div>
                {t('started')} {date(r.startedAt)}
              </div>
              {r.finishedAt && (
                <div>
                  {t('ended')} {date(r.finishedAt)}
                </div>
              )}
            </dl>
          </HoverCardContent>
        </HoverCard>
      ))}
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('history')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            {records.map((r) => (
              <Button
                key={r.id}
                variant="ghost"
                className="w-full justify-between"
                onClick={() => void open(r)}
              >
                {date(r.startedAt)}
                <Status value={r.status} />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
