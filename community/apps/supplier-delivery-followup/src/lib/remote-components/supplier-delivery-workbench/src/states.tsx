import { Button, Skeleton } from '@xpert-ai/plugin-shadcn-ui'
import { TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { React } from './vendor'
import { t } from './i18n'
import { toneClass, toneSurface, type Tone } from './status'

export function EmptyState({
  icon: Icon,
  title,
  body,
  children
}: {
  icon: LucideIcon
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <div
      role="status"
      className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    >
      <Icon aria-hidden className="size-8 text-muted-foreground/70" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-72 text-xs leading-relaxed text-muted-foreground">{body}</p>
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-6 py-10 text-center"
    >
      <TriangleAlert aria-hidden className="size-7 text-destructive" />
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('error.retry')}
      </Button>
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 p-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

/** A full-width notice tied to the selected reply; keeps durable state next to the object it describes. */
export function Notice({
  tone,
  icon: Icon,
  title,
  body,
  action,
  spinning
}: {
  tone: Tone
  icon: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  spinning?: boolean
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-md px-3 py-2.5 ${toneSurface[tone]}`}
    >
      <Icon
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 ${toneClass[tone]} ${spinning ? 'motion-safe:animate-spin' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${toneClass[tone]}`}>{title}</p>
        {body ? <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
