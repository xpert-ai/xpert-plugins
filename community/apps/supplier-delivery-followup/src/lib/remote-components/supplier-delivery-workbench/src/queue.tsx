import { Button, Input, ScrollArea } from '@xpert-ai/plugin-shadcn-ui'
import { Inbox, PackageOpen, Plus, Search } from 'lucide-react'
import { React } from './vendor'
import type { OrderLineSummaryDto, ReplySummaryDto } from '../../../workbench-contract'
import { formatDate, formatDateTime, t } from './i18n'
import { DelayLabel, ReplyStatus } from './status'
import { EmptyState, ErrorState, ListSkeleton } from './states'

const { useMemo } = React

export function ReplyQueue({
  replies,
  loading,
  error,
  selectedId,
  onSelect,
  onCreate,
  onRetry
}: {
  replies: ReplySummaryDto[] | null
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onRetry: () => void
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!replies && loading) return <ListSkeleton />
  if (!replies?.length) {
    return (
      <EmptyState icon={Inbox} title={t('queue.emptyTitle')} body={t('queue.emptyBody')}>
        <Button size="sm" onClick={onCreate}>
          <Plus aria-hidden />
          {t('toolbar.newReply')}
        </Button>
      </EmptyState>
    )
  }
  return (
    <ScrollArea className="h-full min-h-0" data-sdf-scroll>
      <ul className="flex flex-col p-1.5" aria-label={t('tabs.replies')}>
        {replies.map((reply) => {
          const selected = reply.id === selectedId
          return (
            <li key={reply.id}>
              <Button
                type="button"
                variant={selected ? 'secondary' : 'ghost'}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(reply.id)}
                className="h-auto w-full flex-col items-stretch gap-1 px-2.5 py-2 text-left whitespace-normal"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm font-medium ${reply.supplierName ? '' : 'text-muted-foreground'}`}>
                    {reply.supplierName ?? t('queue.unknownSupplier')}
                  </span>
                  <span className="shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground">
                    {formatDateTime(reply.createdAt)}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed font-normal text-muted-foreground">
                  {reply.preview}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <ReplyStatus status={reply.status} timedOut={reply.parseTimedOut} />
                  {reply.proposalCount > 0 ? (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {t('queue.proposals', { count: reply.proposalCount })}
                    </span>
                  ) : null}
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}

export function OrderList({
  orders,
  loading,
  error,
  search,
  onSearch,
  selectedId,
  onSelect,
  onImport,
  importing,
  onRetry
}: {
  orders: OrderLineSummaryDto[] | null
  loading: boolean
  error: string | null
  search: string
  onSearch: (value: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onImport: () => void
  importing: boolean
  onRetry: () => void
}) {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle || !orders) return orders
    return orders.filter((order) =>
      [order.poNumber, order.materialName, order.materialCode, order.supplierName].some((value) =>
        value.toLowerCase().includes(needle)
      )
    )
  }, [orders, search])

  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!orders && loading) return <ListSkeleton />
  if (!orders?.length) {
    return (
      <EmptyState icon={PackageOpen} title={t('orders.emptyTitle')} body={t('orders.emptyBody')}>
        <Button size="sm" variant="outline" onClick={onImport} disabled={importing}>
          {t('toolbar.importDemo')}
        </Button>
      </EmptyState>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative px-2 pt-2 pb-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t('orders.searchPlaceholder')}
          aria-label={t('orders.searchPlaceholder')}
          className="h-8 pl-7 text-xs"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1" data-sdf-scroll>
        {filtered?.length ? (
          <ul className="flex flex-col p-1.5" aria-label={t('tabs.orders')}>
            {filtered.map((order) => {
              const selected = order.id === selectedId
              return (
                <li key={order.id}>
                  <Button
                    type="button"
                    variant={selected ? 'secondary' : 'ghost'}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelect(order.id)}
                    className="h-auto w-full flex-col items-stretch gap-0.5 px-2.5 py-2 text-left whitespace-normal"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium tabular-nums">
                        {order.poNumber}{' '}
                        <span className="font-normal text-muted-foreground">
                          · {t('orders.line', { lineNo: order.lineNo })}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-normal tabular-nums">
                        {formatDate(order.promisedDate)}
                      </span>
                    </span>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {order.materialName} · {order.supplierName}
                      </span>
                      <DelayLabel days={order.delayDays} className="shrink-0" />
                    </span>
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t('orders.noMatch', { query: search.trim() })}
          </p>
        )}
      </ScrollArea>
    </div>
  )
}
