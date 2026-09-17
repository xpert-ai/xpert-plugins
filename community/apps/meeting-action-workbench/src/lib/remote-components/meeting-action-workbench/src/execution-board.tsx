import {
  AlertTriangle,
  Badge,
  Bot,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  WandSparkles
} from '@xpert-ai/plugin-shadcn-ui'
import type { ReactNode } from 'react'
import { CATALOG, formatDate } from './i18n'
import type { ActionStatus, ExecutionAction, ExecutionContext, Locale, RiskReviewStatus, RiskSignal } from './types'
import { React } from './vendor'

type Messages = (typeof CATALOG)['zh-Hans']

interface ExecutionBoardProps {
  execution: ExecutionContext
  locale: Locale
  t: Messages
  busy: boolean
  statusFilter: 'all' | Exclude<ActionStatus, 'pending_confirmation'>
  ownerFilter: string
  onStatusFilter: (value: 'all' | Exclude<ActionStatus, 'pending_confirmation'>) => void
  onOwnerFilter: (value: string) => void
  onRunPatrol: () => void
  onUpdateAction: (action: ExecutionAction, status: Exclude<ActionStatus, 'pending_confirmation'>) => void
  onReviewRisk: (risk: RiskSignal, status: Exclude<RiskReviewStatus, 'open'>) => void
  onPage: (page: number) => void
}

export function ExecutionBoard({
  execution,
  locale,
  t,
  busy,
  statusFilter,
  ownerFilter,
  onStatusFilter,
  onOwnerFilter,
  onRunPatrol,
  onUpdateAction,
  onReviewRisk,
  onPage
}: ExecutionBoardProps) {
  const risks = [...execution.ruleSignals, ...execution.agentSignals]
  const review = execution.latestReview
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-6 p-5">
        <section aria-labelledby="execution-overview">
          <SectionHeading id="execution-overview" title={t.executionOverview} actions={
            <Button onClick={onRunPatrol} disabled={busy || execution.summary.total === 0}>
              <WandSparkles aria-hidden />{t.agentPatrol}
            </Button>
          } />
          <div className="grid grid-cols-4 gap-3 lg:grid-cols-8">
            <ExecutionMetric label={t.total} value={execution.summary.total} />
            <ExecutionMetric label={t.pending} value={execution.summary.pending} />
            <ExecutionMetric label={t.inProgress} value={execution.summary.inProgress} />
            <ExecutionMetric label={t.completed} value={execution.summary.completed} />
            <ExecutionMetric label={t.overdue} value={execution.summary.overdue} tone="danger" />
            <ExecutionMetric label={t.dueSoon} value={execution.summary.dueSoon} tone="warning" />
            <ExecutionMetric label={t.missingOwner} value={execution.summary.missingOwner} tone="warning" />
            <ExecutionMetric label={t.missingDueDate} value={execution.summary.missingDueDate} tone="warning" />
          </div>
          {review?.status === 'processing' ? <p className="mt-3 text-sm text-muted-foreground">{t.agentReviewProcessing}</p> : null}
          {review?.status === 'failed' ? <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><strong>{t.agentReviewFailed} · {review.errorCode}</strong><p>{review.errorMessage}</p></div> : null}
        </section>

        <section aria-labelledby="execution-actions">
          <SectionHeading id="execution-actions" title={t.actions} count={execution.total} actions={
            <div className="flex items-center gap-2">
              <Input value={ownerFilter} onChange={(event) => onOwnerFilter(event.target.value)} placeholder={t.ownerFilter} className="w-40" />
              <Select value={statusFilter} onValueChange={(value) => onStatusFilter(value as ExecutionBoardProps['statusFilter'])}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allStatuses}</SelectItem>
                  <SelectItem value="pending">{t.statusLabels.pending}</SelectItem>
                  <SelectItem value="in_progress">{t.statusLabels.in_progress}</SelectItem>
                  <SelectItem value="completed">{t.statusLabels.completed}</SelectItem>
                  <SelectItem value="cancelled">{t.statusLabels.cancelled}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          } />
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[minmax(15rem,2fr)_minmax(8rem,1fr)_7rem_8rem_10rem] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>{t.actions}</span><span>{t.owner}</span><span>{t.dueDate}</span><span>{t.priority}</span><span>{t.executionStatus}</span>
            </div>
            {execution.actions.map((action) => (
              <div key={action.id} className="grid grid-cols-[minmax(15rem,2fr)_minmax(8rem,1fr)_7rem_8rem_10rem] items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{action.task}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{action.meetingTitle}</p>
                  {action.ruleFlags.length ? <div className="mt-2 flex flex-wrap gap-1">{action.ruleFlags.map((flag) => <Badge key={flag} variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">{t.riskTypeLabels[flag]}</Badge>)}</div> : null}
                </div>
                <span className="text-sm">{action.owner ?? '—'}</span>
                <span className="text-sm">{action.dueDate ?? '—'}</span>
                <Badge variant="outline">{t.priorityLabels[action.priority]}</Badge>
                <Select value={action.status} disabled={busy} onValueChange={(value) => onUpdateAction(action, value as Exclude<ActionStatus, 'pending_confirmation'>)}>
                  <SelectTrigger aria-label={`${t.updateStatus} · ${action.task}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t.statusLabels.pending}</SelectItem>
                    <SelectItem value="in_progress">{t.statusLabels.in_progress}</SelectItem>
                    <SelectItem value="completed">{t.statusLabels.completed}</SelectItem>
                    <SelectItem value="cancelled">{t.statusLabels.cancelled}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            {execution.actions.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted-foreground"><p className="font-medium text-foreground">{t.noExecutionActions}</p><p className="mt-1">{t.confirmedActionsOnly}</p></div> : null}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" disabled={busy || execution.page <= 1} onClick={() => onPage(execution.page - 1)}>{t.previousPage}</Button>
            <span>{t.pageLabel} {execution.page}</span>
            <Button size="sm" variant="outline" disabled={busy || !execution.hasMore} onClick={() => onPage(execution.page + 1)}>{t.nextPage}</Button>
          </div>
        </section>

        <section aria-labelledby="execution-risks">
          <SectionHeading id="execution-risks" title={t.riskRadar} count={risks.length} />
          <div className="grid gap-3 lg:grid-cols-2">
            {risks.map((risk) => <RiskRow key={risk.id} risk={risk} t={t} busy={busy} onReview={onReviewRisk} />)}
            {risks.length === 0 ? <div className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t.noRisks}</div> : null}
          </div>
        </section>

        <section aria-labelledby="execution-brief">
          <SectionHeading id="execution-brief" title={t.followUpBrief} actions={review ? <span className="text-xs text-muted-foreground">{t.latestPatrol} · {formatDate(locale, review.updatedAt)}</span> : undefined} />
          {review?.followUpBrief ? <BriefContent text={review.followUpBrief} /> : <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground"><Bot className="mx-auto mb-3 size-7" aria-hidden />{t.noBrief}</div>}
        </section>
      </div>
    </div>
  )
}

function BriefContent({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return <div className="rounded-lg border bg-muted/20 p-5 text-sm leading-7">
    {lines.map((line, index) => {
      if (line.startsWith('## ')) return <h3 key={index} className="mb-2 text-base font-semibold">{line.slice(3)}</h3>
      if (line.startsWith('- ')) return <div key={index} className="flex gap-2"><span aria-hidden>•</span><p>{line.slice(2)}</p></div>
      return <p key={index}>{line}</p>
    })}
  </div>
}

function SectionHeading({ id, title, count, actions }: { id: string; title: string; count?: number; actions?: ReactNode }) {
  return <div data-section-layout="title-actions-divider-content" className="mb-3"><header className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 id={id} className="text-sm font-semibold">{title}</h2>{count != null ? <Badge variant="secondary">{count}</Badge> : null}</div>{actions}</header><Separator className="mt-2" /></div>
}

function ExecutionMetric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'warning' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'
  return <div className="rounded-lg border bg-card px-3 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p></div>
}

function RiskRow({ risk, t, busy, onReview }: { risk: RiskSignal; t: Messages; busy: boolean; onReview: ExecutionBoardProps['onReviewRisk'] }) {
  const severityClass = risk.severity === 'high' ? 'border-destructive/40 text-destructive' : risk.severity === 'medium' ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : ''
  const title = risk.source === 'rule' ? t.riskTypeLabels[risk.riskType] : risk.title
  return <article className="rounded-lg border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><AlertTriangle className="size-4" aria-hidden /><h3 className="text-sm font-medium">{title}</h3><Badge variant="outline" className={severityClass}>{t.severityLabels[risk.severity]}</Badge><Badge variant="secondary">{risk.source === 'rule' ? t.ruleDetected : t.agentDetected}</Badge></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{risk.source === 'rule' ? risk.evidenceQuote : risk.rationale}</p>
        {risk.source === 'agent' ? <p className="mt-2 text-xs"><strong>{t.evidence}：</strong>{risk.evidenceQuote}</p> : null}
        {risk.source === 'agent' ? <p className="mt-2 text-xs"><strong>{t.recommendation}：</strong>{risk.recommendation}</p> : null}
      </div>
      <Badge variant="outline">{t.riskReviewLabels[risk.reviewStatus]}</Badge>
    </div>
    {risk.source === 'agent' && risk.reviewStatus === 'open' ? <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => onReview(risk, 'dismissed')}>{t.dismiss}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onReview(risk, 'accepted')}>{t.accept}</Button><Button size="sm" disabled={busy} onClick={() => onReview(risk, 'resolved')}>{t.resolve}</Button></div> : null}
  </article>
}
