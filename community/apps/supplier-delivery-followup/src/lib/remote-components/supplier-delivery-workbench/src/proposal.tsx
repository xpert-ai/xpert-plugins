import {
  Badge,
  Button,
  Card,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import { ArrowRight, Check, Pencil, Quote, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { React } from './vendor'
import type { ChangeType, EvidenceField, ProposalDecision, ProposalDto } from '../../../workbench-contract'
import { formatDate, formatPercent, t, type MessageKey } from './i18n'
import { DelayLabel, daysBetween, toneClass } from './status'

const changeLabel: Record<ChangeType, MessageKey> = {
  delay: 'change.delay',
  advance: 'change.advance',
  unchanged: 'change.unchanged',
  partial: 'change.partial'
}

const fieldLabel: Record<EvidenceField, MessageKey> = {
  poNumber: 'field.poNumber',
  proposedDate: 'field.proposedDate',
  proposedQuantity: 'field.proposedQuantity',
  batches: 'field.batches',
  reason: 'field.reason'
}

/** The date that confirming would write: a human edit wins over the assistant suggestion. */
export function effectiveDate(proposal: ProposalDto) {
  return proposal.finalDate ?? proposal.proposedDate ?? proposal.baseDate
}

// Green means "this will be written on confirm", red means "discarded"; the default accent is too faint in dark hosts.
const applyOn =
  'data-[state=on]:bg-[color:var(--status-success-background)] data-[state=on]:text-[color:var(--status-success)] data-[state=on]:font-medium'
const rejectOn =
  'data-[state=on]:bg-[color:var(--status-destructive-background)] data-[state=on]:text-destructive data-[state=on]:font-medium'

function EvidenceButton({
  proposal,
  field,
  onShow
}: {
  proposal: ProposalDto
  field: EvidenceField
  onShow: (field: EvidenceField) => void
}) {
  if (!proposal.evidence.some((item) => item.field === field)) return null
  const label = t('proposal.evidence', { field: t(fieldLabel[field]) })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onShow(field)
          }}
        >
          <Quote aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Row({ label, children, evidence }: { label: string; children: ReactNode; evidence?: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-2 py-1">
      <dt className="pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
      <div className="flex h-6 items-center">{evidence}</div>
    </div>
  )
}

export function ProposalCard({
  proposal,
  active,
  readOnly,
  confirming,
  busy,
  onActivate,
  onShowEvidence,
  onDecide,
  onEdit
}: {
  proposal: ProposalDto
  active: boolean
  readOnly: boolean
  /** The reply's confirmation stopped part-way; see ReplyDetailDto.confirmationInProgress. */
  confirming: boolean
  busy: boolean
  onActivate: () => void
  onShowEvidence: (field: EvidenceField) => void
  onDecide: (decision: Exclude<ProposalDecision, 'pending' | 'edited'>) => void
  onEdit: () => void
}) {
  const po = t('proposal.order', { po: proposal.poNumber, line: proposal.lineNo })
  const edited = proposal.decision === 'edited'
  // Show the date confirming would write (a human edit wins), relative to the date the assistant saw.
  const target = edited ? effectiveDate(proposal) : proposal.proposedDate
  // Mid-confirmation the only change left is rejecting a proposal whose order line moved in the meantime.
  const locked = readOnly || (confirming && !(proposal.stale && proposal.decision !== 'rejected'))
  return (
    <Card
      data-active={active ? 'true' : undefined}
      onClick={onActivate}
      onFocusCapture={onActivate}
      // Mark the active card with its own border and a soft shadow; an outer ring would be clipped by the scroll area.
      className={`gap-0 py-0 transition-[border-color,box-shadow] ${active ? 'border-foreground/35 shadow-md' : ''} ${proposal.decision === 'rejected' ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-medium tabular-nums">
            {po}
            <EvidenceButton proposal={proposal} field="poNumber" onShow={onShowEvidence} />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {proposal.materialName} · {proposal.supplierName}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={proposal.changeType === 'delay' || proposal.changeType === 'partial' ? toneClass.warning : ''}
        >
          {t(changeLabel[proposal.changeType])}
        </Badge>
      </div>

      <dl className="px-4 py-2">
        <Row
          label={t('proposal.proposed')}
          evidence={<EvidenceButton proposal={proposal} field="proposedDate" onShow={onShowEvidence} />}
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
            <span className="text-muted-foreground">{formatDate(proposal.baseDate)}</span>
            <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{formatDate(target ?? proposal.baseDate)}</span>
            {target ? <DelayLabel days={daysBetween(proposal.baseDate, target)} /> : null}
          </span>
          {edited && proposal.proposedDate && proposal.proposedDate !== target ? (
            <span className="block text-xs text-muted-foreground">
              {t('inspector.timelineAi', { date: formatDate(proposal.proposedDate) })}
            </span>
          ) : null}
        </Row>
        {proposal.proposedQuantity !== null ? (
          <Row
            label={t('proposal.quantity')}
            evidence={<EvidenceButton proposal={proposal} field="proposedQuantity" onShow={onShowEvidence} />}
          >
            <span className="tabular-nums">
              {proposal.proposedQuantity} {proposal.unit}
            </span>
          </Row>
        ) : null}
        {proposal.batches.length ? (
          <Row
            label={t('proposal.batches')}
            evidence={<EvidenceButton proposal={proposal} field="batches" onShow={onShowEvidence} />}
          >
            <ul className="flex flex-col gap-0.5 tabular-nums">
              {proposal.batches.map((batch, index) => (
                <li key={`${batch.date}-${index}`}>
                  {t('proposal.batch', { quantity: batch.quantity, unit: proposal.unit, date: formatDate(batch.date) })}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
        {proposal.reason ? (
          <Row
            label={t('proposal.reason')}
            evidence={<EvidenceButton proposal={proposal} field="reason" onShow={onShowEvidence} />}
          >
            {proposal.reason}
          </Row>
        ) : null}
      </dl>

      {edited ? (
        <p className="mx-4 mb-2 flex items-center gap-1.5 text-xs text-primary">
          <Pencil aria-hidden className="size-3.5" />
          {t('proposal.editedTo', {
            value: [
              proposal.finalDate ? formatDate(proposal.finalDate) : null,
              proposal.finalQuantity !== null ? `${proposal.finalQuantity} ${proposal.unit}` : null
            ]
              .filter(Boolean)
              .join(' · ')
          })}
        </p>
      ) : null}
      {/* A rejected proposal is never written, so its old order data no longer needs action. */}
      {proposal.stale && proposal.decision !== 'rejected' ? (
        <p role="alert" className={`mx-4 mb-2 flex items-center gap-1.5 text-xs ${toneClass.warning}`}>
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {t(confirming ? 'proposal.staleConfirming' : 'proposal.stale')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-4 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="cursor-help text-xs text-muted-foreground tabular-nums outline-none focus-visible:underline"
            >
              {t('proposal.confidence', { value: formatPercent(proposal.confidence) })}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{t('proposal.confidenceHint')}</TooltipContent>
        </Tooltip>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label={t('proposal.decision', { po })}
          value={proposal.decision === 'pending' ? '' : proposal.decision}
          disabled={locked || busy}
          onValueChange={(value: string) => {
            if (value === 'accepted' || value === 'rejected') onDecide(value)
            else if (value === 'edited') onEdit()
          }}
        >
          <ToggleGroupItem value="accepted" aria-label={t('proposal.accept')} className={applyOn} disabled={confirming}>
            <Check aria-hidden />
            {t('proposal.accept')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="edited"
            aria-label={t('proposal.edit')}
            className={applyOn}
            disabled={confirming}
            onClick={() => edited && onEdit()}
          >
            <Pencil aria-hidden />
            {t('proposal.edit')}
          </ToggleGroupItem>
          <ToggleGroupItem value="rejected" aria-label={t('proposal.reject')} className={rejectOn}>
            <X aria-hidden />
            {t('proposal.reject')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </Card>
  )
}
