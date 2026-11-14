/**
 * 界面里反复用到的小组件：状态徽标、提示条、带二次确认的按钮、区块三段式。
 * 二次确认一律用 shadcn 的 AlertDialog，不用浏览器原生 confirm()（skill “Confirmation Dialog Standard”）。
 */
import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Separator
} from '@xpert-ai/plugin-shadcn-ui'
import type { Translate } from './i18n'
import type { RequestStatus } from './types'

const STATUS_VARIANT: Record<RequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  analyzing: 'secondary',
  failed: 'destructive',
  pending_review: 'default',
  confirmed: 'secondary',
  rejected: 'outline'
}

export function StatusBadge({ status, t }: { status: RequestStatus; t: Translate }) {
  return <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
}

/** 提示条：info 用中性色，error 用 destructive 色；role=status 让读屏软件能读到 */
export function Notice({ kind, children, action }: { kind: 'info' | 'error'; children: React.ReactNode; action?: React.ReactNode }) {
  const tone = kind === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted text-foreground'
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${tone}`}>
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

/** 外层大区块的三段式：标题和本区操作 / 分隔线 / 内容（不用外层 Card） */
export function Section(props: { title: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={props.label} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{props.title}</h2>
        {props.actions && <div className="flex flex-wrap items-center gap-2">{props.actions}</div>}
      </div>
      <Separator />
      {props.children}
    </section>
  )
}

/** 带二次确认的按钮：点按钮弹 AlertDialog，“取消”只关闭，“确认”才执行 onConfirm */
export function ConfirmButton(props: {
  label: string
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  disabled?: boolean
  variant?: 'default' | 'outline' | 'destructive' | 'secondary'
  confirmVariant?: 'default' | 'destructive'
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={props.variant ?? 'default'} disabled={props.disabled}>
          {props.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{props.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant={props.confirmVariant ?? 'default'} onClick={props.onConfirm}>
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** 毫秒 → “分:秒” */
export function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** ISO 时间 → 本地“月-日 时:分:秒”，用于日志和技术详情 */
export function formatTime(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
