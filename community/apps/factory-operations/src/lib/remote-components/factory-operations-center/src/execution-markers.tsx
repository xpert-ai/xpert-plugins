import * as React from 'react'
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/index'
import type { SupportedLocale } from './i18n'
import type { ExecutionRecord } from './types'

const h: typeof React.createElement = React.createElement

export function ExecutionMarkers({ records, locale, onOpenExecution, className = '' }: {
  records: ExecutionRecord[]
  locale: SupportedLocale
  onOpenExecution: (record: ExecutionRecord) => void
  className?: string
}) {
  return (
    <TooltipProvider delayDuration={180}>
      <div className={`foc-execution-markers ${className}`} aria-label={locale === 'en-US' ? 'Recent Assistant executions' : '近期 Assistant 执行'}>
        {records.slice(0, 10).map((record) => (
          <Tooltip key={record.recordId}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`foc-execution-dot is-${record.status}`}
                aria-label={`#${record.attemptNumber} ${record.safeSummary}`}
                disabled={!record.conversationId}
                onClick={() => onOpenExecution(record)}
              >
                <span aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="foc-execution-tooltip" side="top" align="start">
              <strong>#{record.attemptNumber} · {record.roleLabel}</strong>
              <small>{executionStatus(record.status, locale)} · {formatTime(record.startedAt, locale)}</small>
              <p>{record.safeSummary}</p>
              <span>r{record.inputRevision}{record.outputRevision ? ` → r${record.outputRevision}` : ''}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

function executionStatus(status: ExecutionRecord['status'], locale: SupportedLocale) {
  const labels: Record<ExecutionRecord['status'], [string, string]> = {
    queued: ['Queued', '排队中'], running: ['Running', '执行中'], succeeded: ['Succeeded', '成功'],
    failed: ['Failed', '失败'], interrupted: ['Interrupted', '已中断'], cancelled: ['Cancelled', '已取消'],
    superseded: ['Superseded', '已被重试替代']
  }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}
