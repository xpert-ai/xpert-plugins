/**
 * 请求详情（产品设计 5.3、5.4 节）：按请求状态切换显示——
 * - 草稿：AI 分析 / 删除草稿
 * - 分析中：已用时间；超过 30 秒出现“放弃本次分析”（任务卡住时不用干等 3 分钟超时）
 * - 分析失败：失败原因 + 重试 + 技术详情
 * - 待确认：总结论 + 缺料逐条采纳/驳回 + 备注 + 确认区（AlertDialog）+ 驳回本次分析
 * - 已确认 / 已驳回：只读结果；已驳回可重新分析
 * 依据、操作日志默认折叠（渐进披露：必须做决定的信息放主路径，证据按需展开）。
 * Python 类比：一个按 status 分支渲染的模板，每个按钮回调都只是调后端接口，再刷新数据。
 */
import * as React from 'react'
import {
  Badge,
  Button,
  ChevronDown,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
  Textarea,
  ToggleGroup,
  ToggleGroupItem
} from '@xpert-ai/plugin-shadcn-ui'
import { describeCode } from './i18n'
import type { Translate } from './i18n'
import type { FindingDto, RequestDetail } from './types'
import { ConfirmButton, Notice, StatusBadge, formatElapsed, formatTime } from './ui'

/** 分析中超过这个时长才显示“放弃本次分析”，避免刚点完分析就误点放弃 */
export const ABANDON_AFTER_MS = 30 * 1000

export interface DetailActions {
  start: (requestId: string) => Promise<void>
  abandon: (requestId: string, jobId: string) => Promise<void>
  decide: (findingId: string, decision: 'accepted' | 'rejected', note: string) => Promise<void>
  confirm: (requestId: string, finalDate: string, note: string) => Promise<void>
  reject: (requestId: string, reason: string) => Promise<void>
  remove: (requestId: string) => Promise<void>
}

export function RequestDetailView(props: { detail: RequestDetail; t: Translate; busy: boolean; now: number; actions: DetailActions }) {
  const { detail, t, busy, now, actions } = props
  const { request, currentJob, findings } = detail
  const status = request.status
  // 已用时间按服务器时间校正，避免本机时钟偏差
  const skew = Date.parse(detail.serverTime) - Date.now()
  const elapsedMs = currentJob?.createdAt ? Math.max(0, now + skew - Date.parse(currentJob.createdAt)) : 0
  const startLabel = status === 'failed' ? t('detail.retry') : status === 'rejected' ? t('detail.reanalyse') : t('detail.startAnalysis')
  // 失败时的“重试”放在失败提示条里，标题区只放草稿的“AI 分析”和已驳回的“重新分析”
  const canStart = status === 'draft' || status === 'rejected'

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* 标题和本区操作 */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {request.orderNo} · {request.customerName} · {request.productName} × {request.quantity}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('detail.targetLine', { target: request.targetDate, original: request.originalDueDate })}
            {currentJob ? ` · ${t('detail.attempt', { seq: currentJob.seq })}` : ''}
          </p>
          {request.remark && <p className="text-xs text-muted-foreground">{request.remark}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} t={t} />
          {status === 'draft' && (
            <ConfirmButton
              label={t('detail.deleteDraft')}
              variant="outline"
              disabled={busy}
              title={t('delete.title')}
              description={t('delete.body', { orderNo: request.orderNo })}
              confirmLabel={t('delete.ok')}
              cancelLabel={t('app.cancel')}
              confirmVariant="destructive"
              onConfirm={() => void actions.remove(request.id)}
            />
          )}
          {canStart && (
            <Button size="sm" disabled={busy} onClick={() => void actions.start(request.id)}>
              {startLabel}
            </Button>
          )}
        </div>
      </div>
      <Separator />

      {status === 'analyzing' && currentJob && (
        <Notice
          kind="info"
          action={
            elapsedMs >= ABANDON_AFTER_MS ? (
              <ConfirmButton
                label={t('detail.abandon')}
                variant="outline"
                disabled={busy}
                title={t('abandon.title')}
                description={t('abandon.body')}
                confirmLabel={t('abandon.ok')}
                cancelLabel={t('app.cancel')}
                confirmVariant="destructive"
                onConfirm={() => void actions.abandon(request.id, currentJob.id)}
              />
            ) : undefined
          }
        >
          {t('detail.analyzing', { elapsed: formatElapsed(elapsedMs) })}
        </Notice>
      )}

      {status === 'failed' && currentJob && (
        <Notice
          kind="error"
          action={
            <Button size="sm" disabled={busy} onClick={() => void actions.start(request.id)}>
              {t('detail.retry')}
            </Button>
          }
        >
          {t('detail.failed', { reason: currentJob.errorCode ? describeCode(t, currentJob.errorCode) : '—' })}
        </Notice>
      )}

      {status === 'rejected' && request.rejectReason && <Notice kind="info">{t('detail.rejectedLine', { reason: request.rejectReason })}</Notice>}
      {status === 'confirmed' && request.finalDate && (
        <Notice kind="info">
          {t('detail.confirmedLine', { date: request.finalDate })}
          {request.finalNote ? ` · ${request.finalNote}` : ''}
        </Notice>
      )}

      {currentJob?.status === 'succeeded' && (
        <>
          <div className="flex flex-col gap-1 border-l-4 border-primary py-1 pl-3">
            <strong className="text-sm">
              {t('detail.summary')}：
              {t('detail.summaryHead', {
                feasibility: currentJob.feasibility ? t(`feasibility.${currentJob.feasibility}`) : '—',
                date: currentJob.recommendedDate ?? '—'
              })}
            </strong>
            <p className="text-sm whitespace-pre-wrap">{currentJob.summary}</p>
          </div>
          <h3 className="text-sm font-semibold">{t('detail.findings', { count: findings.length })}</h3>
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('detail.noShortage')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {findings.map((finding) => (
                <FindingItem
                  key={finding.id}
                  finding={finding}
                  t={t}
                  editable={status === 'pending_review'}
                  onDecide={actions.decide}
                />
              ))}
            </ul>
          )}
          {status === 'pending_review' && <DecisionArea detail={detail} t={t} busy={busy} actions={actions} />}
        </>
      )}

      <TechnicalDetails detail={detail} t={t} />
    </div>
  )
}

/** 一条缺料结论：数字、建议、说明、我的决定（采纳/驳回 + 备注）、可展开的依据 */
function FindingItem(props: { finding: FindingDto; t: Translate; editable: boolean; onDecide: DetailActions['decide'] }) {
  const { finding, t, editable } = props
  const [note, setNote] = React.useState(finding.decisionNote ?? '')
  // 服务端数据刷新后同步备注（例如另一处改过）
  React.useEffect(() => setNote(finding.decisionNote ?? ''), [finding.decisionNote])
  const decided = finding.decision === 'accepted' || finding.decision === 'rejected'
  const evidence = finding.evidence
  const orders = (items: { poNo: string; qty: number; eta: string }[]) =>
    items.length ? items.map((item) => `${item.poNo} ${item.qty} @ ${item.eta}`).join('；') : t('detail.evidenceNone')

  const suggestion = [
    t(`suggestion.${finding.suggestionType}`),
    finding.substituteCode ?? '',
    finding.suggestedDate ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {finding.materialCode} {finding.materialName}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('detail.required')} {finding.requiredQty} · {t('detail.available')} {finding.availableQty} · {t('detail.shortage')}{' '}
          <span className="font-semibold text-destructive">{finding.shortageQty}</span>
        </span>
      </div>
      <div className="text-sm">
        <span className="font-medium">
          {t('detail.suggestion')}：{suggestion}
        </span>
        <p className="text-muted-foreground">{finding.rationale}</p>
      </div>
      {!editable ? (
        // 只读（已确认/已驳回）：直接写出最终决定，而不是显示一组变灰的按钮
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">{t('detail.decision')}</span>
          <Badge variant={finding.decision === 'rejected' ? 'destructive' : 'outline'}>{t(`decision.${finding.decision}`)}</Badge>
          {finding.decisionNote && <span className="text-muted-foreground">{finding.decisionNote}</span>}
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('detail.decision')}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={decided ? finding.decision : ''}
          disabled={!editable}
          onValueChange={(value) => {
            // 再点一次已选中的项时 Radix 会传空串：保持原决定，不当成“取消决定”
            if (value === 'accepted' || value === 'rejected') void props.onDecide(finding.id, value, note)
          }}
        >
          <ToggleGroupItem value="accepted">{t('detail.accept')}</ToggleGroupItem>
          <ToggleGroupItem value="rejected">{t('detail.reject')}</ToggleGroupItem>
        </ToggleGroup>
        <Input
          aria-label={t('detail.notePlaceholder')}
          placeholder={t('detail.notePlaceholder')}
          className="h-7 min-w-32 flex-1"
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          // 已有决定时，离开输入框就把备注一起保存；还没决定时，备注随下一次点采纳/驳回一起提交
          onBlur={() => {
            if (decided && note !== (finding.decisionNote ?? '')) void props.onDecide(finding.id, finding.decision as 'accepted' | 'rejected', note)
          }}
        />
      </div>
      )}
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-3 group-data-[state=open]:hidden" />
          <ChevronDown className="hidden size-3 group-data-[state=open]:block" />
          {t('detail.evidence')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
            <li>{t('detail.evidenceBom', { paths: evidence.bomUsages.map((usage) => `${usage.componentCode} ${usage.componentName} ×${usage.qtyPerProduct}`).join('；') })}</li>
            <li>{t('detail.evidenceStock', { onHand: evidence.onHand, at: evidence.inventorySnapshotAt })}</li>
            <li>{t('detail.evidenceInbound', { items: orders(evidence.inboundInWindow) })}</li>
            <li>{t('detail.evidenceLate', { items: orders(evidence.inboundLate) })}</li>
            <li>{t('detail.evidenceLead', { days: evidence.leadTimeDays ?? '—', date: evidence.earliestAvailableDate })}</li>
            {evidence.substitute && (
              <li>
                {t('detail.evidenceSubstitute', {
                  code: evidence.substitute.code,
                  name: evidence.substitute.name,
                  onHand: evidence.substitute.onHand,
                  note: evidence.substitute.note
                })}
              </li>
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/** 确认区：最终交期 + 说明 + [驳回本次分析] [确认结论]；有未决定的条目时不能确认 */
function DecisionArea(props: { detail: RequestDetail; t: Translate; busy: boolean; actions: DetailActions }) {
  const { detail, t, busy, actions } = props
  const { request, currentJob, findings } = detail
  const [finalDate, setFinalDate] = React.useState(currentJob?.recommendedDate ?? request.targetDate)
  const [note, setNote] = React.useState('')
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  // 换了请求或换了一次分析，就把确认区重置为新的建议交期
  React.useEffect(() => {
    setFinalDate(currentJob?.recommendedDate ?? request.targetDate)
    setNote('')
  }, [request.id, currentJob?.id])

  const undecided = findings.filter((finding) => finding.decision === 'pending').length
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(finalDate)

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="es-finalDate">{t('detail.finalDate')}</Label>
          <Input id="es-finalDate" type="date" value={finalDate} onChange={(event) => setFinalDate(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="es-finalNote">{t('detail.finalNote')}</Label>
          <Input
            id="es-finalNote"
            maxLength={500}
            placeholder={t('detail.finalNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      {undecided > 0 && <p className="text-xs text-muted-foreground">{t('detail.undecided', { count: undecided })}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
          {t('detail.rejectAnalysis')}
        </Button>
        <ConfirmButton
          label={t('detail.confirm')}
          disabled={busy || undecided > 0 || !dateValid}
          title={t('confirm.title')}
          description={t('confirm.body', { date: finalDate })}
          confirmLabel={t('confirm.ok')}
          cancelLabel={t('app.cancel')}
          onConfirm={() => void actions.confirm(request.id, finalDate, note.trim())}
        />
      </div>
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open)
          if (!open) setReason('')
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('reject.title')}</DialogTitle>
            <DialogDescription>{t('reject.body')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-rejectReason">{t('reject.reason')}</Label>
            <Textarea id="es-rejectReason" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t('app.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() => {
                setRejectOpen(false)
                void actions.reject(request.id, reason.trim())
              }}
            >
              {t('reject.ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 技术详情（默认折叠）：历次分析任务、操作日志 */
function TechnicalDetails({ detail, t }: { detail: RequestDetail; t: Translate }) {
  if (!detail.jobs.length && !detail.logs.length) return null
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 group-data-[state=open]:hidden" />
        <ChevronDown className="hidden size-3 group-data-[state=open]:block" />
        {t('detail.techDetails')} · {t('detail.logs', { count: detail.logs.length })}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">
          <ul className="flex flex-col gap-0.5">
            {detail.jobs.map((job) => (
              <li key={job.id}>
                {t('detail.jobLine', { seq: job.seq, status: t(`jobStatus.${job.status}`), time: formatTime(job.createdAt) })}
                {job.errorCode ? ` · ${job.errorCode}` : ''}
              </li>
            ))}
          </ul>
          <Separator />
          <ul className="flex flex-col gap-0.5">
            {detail.logs.map((log) => (
              <li key={log.id} className="break-words">
                {formatTime(log.createdAt)} · {log.actor} · {log.action} · {log.summary}
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
