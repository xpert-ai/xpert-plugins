import { ScrollArea, Separator, Skeleton } from '@xpert-ai/plugin-shadcn-ui'
import { CalendarClock } from 'lucide-react'
import type { ReactNode } from 'react'
import { React } from './vendor'
import type { OrderLineDetailDto } from '../../../workbench-contract'
import { formatDate, formatDateTime, t } from './i18n'
import { DelayLabel, daysBetween, toneClass } from './status'
import { EmptyState, ErrorState } from './states'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm tabular-nums">{children}</dd>
    </div>
  )
}

function Dot({ tone }: { tone: 'neutral' | 'warning' | 'success' | 'current' }) {
  const color =
    tone === 'warning'
      ? 'bg-[color:var(--status-warning)]'
      : tone === 'success'
        ? 'bg-[color:var(--status-success)]'
        : tone === 'current'
          ? 'bg-primary'
          : 'bg-muted-foreground/50'
  // The list has 1rem of left padding plus a 1px rail; centre the 10px dot on the rail.
  return (
    <span
      aria-hidden
      className={`absolute top-1.5 -left-[calc(1rem+5.5px)] size-2.5 rounded-full ring-4 ring-background ${color}`}
    />
  )
}

export function OrderInspector({
  order,
  loading,
  error,
  onRetry
}: {
  order: OrderLineDetailDto | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!order && loading) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    )
  }
  if (!order)
    return <EmptyState icon={CalendarClock} title={t('inspector.emptyTitle')} body={t('inspector.emptyBody')} />

  const changes = [...order.changes].sort((left, right) => left.confirmedAt.localeCompare(right.confirmedAt))
  return (
    <ScrollArea className="h-full min-h-0" data-sdf-scroll>
      <div aria-busy={loading ? 'true' : undefined} className="flex flex-col gap-4 p-4">
        <div>
          <p className="text-sm font-medium tabular-nums">
            {t('proposal.order', { po: order.poNumber, line: order.lineNo })}
          </p>
          <p className="text-xs text-muted-foreground">{order.materialCode}</p>
        </div>
        <dl>
          <Field label={t('inspector.supplier')}>{order.supplierName}</Field>
          <Field label={t('inspector.material')}>{order.materialName}</Field>
          <Field label={t('inspector.quantity')}>
            {order.quantity} {order.unit}
          </Field>
          <Field label={t('inspector.original')}>{formatDate(order.originalDate)}</Field>
          <Field label={t('inspector.promised')}>
            <span className="inline-flex items-baseline gap-2">
              <DelayLabel days={order.delayDays} />
              <span className="font-medium">{formatDate(order.promisedDate)}</span>
            </span>
          </Field>
        </dl>
        <Separator />
        <section aria-labelledby="sdf-timeline-title">
          <h3 id="sdf-timeline-title" className="mb-3 text-xs font-medium text-muted-foreground">
            {t('inspector.timeline')}
          </h3>
          <ol className="relative ml-1.5 flex flex-col gap-4 border-l pl-4">
            <li className="relative">
              <Dot tone="neutral" />
              <p className="text-sm tabular-nums">{formatDate(order.originalDate)}</p>
              <p className="text-xs text-muted-foreground">{t('inspector.timelineOriginal')}</p>
            </li>
            {changes.map((change) => {
              const later = daysBetween(change.oldDate, change.newDate) > 0
              return (
                <li key={change.id} className="relative">
                  <Dot tone={later ? 'warning' : 'success'} />
                  <p className={`text-sm font-medium tabular-nums ${later ? toneClass.warning : toneClass.success}`}>
                    {t('inspector.timelineChange', { date: formatDate(change.newDate) })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {change.confirmedByName
                      ? t('inspector.timelineSource', {
                          time: formatDateTime(change.confirmedAt),
                          user: change.confirmedByName
                        })
                      : t('inspector.timelineSourceAnonymous', { time: formatDateTime(change.confirmedAt) })}
                  </p>
                  {change.aiDate && change.aiDate !== change.newDate ? (
                    <p className="text-xs text-muted-foreground">
                      {t('inspector.timelineAi', { date: formatDate(change.aiDate) })}
                    </p>
                  ) : null}
                  {change.batches.length ? (
                    <ul className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {change.batches.map((batch, index) => (
                        <li key={`${batch.date}-${index}`}>
                          {t('proposal.batch', {
                            quantity: batch.quantity,
                            unit: order.unit,
                            date: formatDate(batch.date)
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
            <li className="relative">
              <Dot tone="current" />
              <p className="text-sm font-medium tabular-nums">{formatDate(order.promisedDate)}</p>
              <p className="text-xs text-muted-foreground">{t('inspector.timelineCurrent')}</p>
            </li>
          </ol>
          {!changes.length ? <p className="mt-3 text-xs text-muted-foreground">{t('inspector.noChanges')}</p> : null}
        </section>
      </div>
    </ScrollArea>
  )
}
