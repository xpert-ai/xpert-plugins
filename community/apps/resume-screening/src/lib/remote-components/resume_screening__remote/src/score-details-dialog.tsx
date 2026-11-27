import {
  Badge, Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle
} from '@xpert-ai/plugin-shadcn-ui'
import { i18n, type ResumeCatalog } from './i18n'
import type { CandidateRow, ResumeDecision } from './types'
import { React } from './vendor'

const DECISIONS: Record<ResumeDecision, keyof ResumeCatalog> = {
  interview: 'decisionInterview', pending: 'decisionPending', rejected: 'decisionRejected'
}

/** Read-only evidence review; confirmation remains a separate explicit action. */
export function ScoreDetailsDialog({ row, onClose, onReview, onResume }: {
  row: CandidateRow | null
  onClose: () => void
  onReview: (row: CandidateRow) => void
  onResume: (row: CandidateRow) => void
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent showCloseButton={false} className="overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="shrink-0 pr-16">
          <SheetTitle>{i18n.t('scoreDialogTitle', { name: row?.name ?? '' })}</SheetTitle>
          <SheetDescription>{i18n.t('scoreDialogHint')}</SheetDescription>
          <Button variant="ghost" size="sm" className="absolute right-3 top-3" onClick={onClose}>{i18n.t('closeDetails')}</Button>
        </SheetHeader>
        {row ? <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4">
          {row.scoreState === 'stale' || row.scoreState === 'unverified' ? <p className="text-muted-foreground">{i18n.t(row.scoreState === 'stale' ? 'staleEvidenceHint' : 'unverifiedEvidenceHint')}</p> : null}
          <Button variant="outline" onClick={() => onResume(row)}>{i18n.t('viewResume')}</Button>
          {row.totalScore !== null && row.aiTotalScore != null ? <p className="font-medium">
            {i18n.t(row.adjustedTotal != null ? 'scoreAdjustedSummary' : 'scoreOriginalSummary', {
              ai: row.aiTotalScore, score: row.totalScore
            })}
          </p> : null}
          <dl className="grid grid-cols-2 gap-4">
            <div><dt className="text-muted-foreground">{i18n.t('aiOriginalScore')}</dt><dd>{row.aiTotalScore ?? i18n.t('scoreUnscored')}</dd></div>
            <div><dt className="text-muted-foreground">{i18n.t(row.adjustedTotal != null ? 'humanAdjustedScore' : 'effectiveScore')}</dt><dd>{row.totalScore ?? i18n.t('scoreUnscored')}</dd></div>
            <div><dt className="text-muted-foreground">{i18n.t('systemSuggestion')}</dt><dd>{row.suggestedDecision ? i18n.t(DECISIONS[row.suggestedDecision]) : i18n.t('scorePending')}</dd></div>
            <div><dt className="text-muted-foreground">{i18n.t('humanDecision')}</dt><dd>{row.decision ? i18n.t(DECISIONS[row.decision]) : i18n.t('notConfirmed')}</dd></div>
          </dl>
          <section aria-label={i18n.t('scoreDetails')} className="grid gap-2">
            <h3 className="font-medium">{i18n.t('scoreDetails')}</h3>
            {row.dimensions?.length ? <ul className="grid gap-3">{row.dimensions.map((item) => (
              <li key={item.dimension}>
                <p className="flex justify-between gap-4"><span>{i18n.t(item.dimension)}</span><span>{item.score}/20</span></p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{item.reason}</p>
              </li>
            ))}</ul> : <p className="text-muted-foreground">{i18n.t('scorePending')}</p>}
          </section>
          <section aria-label={i18n.t('findingsTitle')} className="grid gap-2">
            <h3 className="font-medium">{i18n.t('findingsTitle')}</h3>
            {row.prescreen.length ? <ul className="grid gap-3">{row.prescreen.map((finding, index) => (
              <li key={`${finding.rule}-${index}`}>
                <p><Badge variant={finding.severity === 'error' ? 'destructive' : 'secondary'}>{i18n.t(finding.severity === 'error' ? 'severityError' : 'severityWarning')}</Badge>{' '}<span className="font-mono">{finding.rule}</span></p>
                <p className="mt-1 whitespace-pre-wrap break-words">{finding.message}</p>
                {finding.evidence ? <blockquote className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{finding.evidence}</blockquote> : null}
              </li>
            ))}</ul> : <p className="text-muted-foreground">{i18n.t('findingsEmpty')}</p>}
          </section>
          {row.note ? <section><h3 className="font-medium">{i18n.t('confirmNoteLabel')}</h3><p className="whitespace-pre-wrap break-words text-muted-foreground">{row.note}</p></section> : null}
        </div> : null}
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>{i18n.t('closeDetails')}</Button>
          <Button disabled={!row || row.totalScore === null} onClick={() => row && onReview(row)}>{i18n.t('reviewFromDetails')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
