import * as React from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Badge, Button, ScrollArea, TabsContent } from '@xpert-ai/plugin-shadcn-ui'
import type { Line, Quotation } from '../view-data'
import type { Translate } from '../presentation'
import { EmptyState } from './ui-helpers'

type PendingReviewPanelProps = {
  t: Translate
  quotation?: Quotation
  knowledgeLines: Line[]
  unmatchedLines: Line[]
  busy: boolean
  dirty: boolean
  knowledgeAiCount: number
  webAiCount: number
  canApply: boolean
  onAcceptAllKnowledge: () => void
  onAcceptAllWeb: () => void
  onApply: () => void
  renderLine: (line: Line, reviewed: boolean) => React.ReactNode
}

export function PendingReviewPanel(props: PendingReviewPanelProps) {
  const reviewCount = props.knowledgeLines.length + props.unmatchedLines.length
  return <TabsContent value="review" className="col-start-2 row-start-2 m-3 min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm data-[state=active]:grid data-[state=active]:grid-rows-[auto_minmax(0,1fr)] max-[1100px]:col-start-1 max-[1100px]:row-start-3 max-[1100px]:m-2">
    {!props.quotation ? <EmptyState icon={<Check aria-hidden className="size-7"/>} title={props.t('noQuotation')}/> : <>
      <PanelHeader title={props.t('reviewTab')} description={props.t('reviewHint')} count={reviewCount}/>
      <ScrollArea className="min-h-0 bg-muted/20">
        <div className="mx-auto grid max-w-[1560px] gap-5 p-4">
          {props.knowledgeLines.length > 0 && <ReviewSection
            title={props.t('knowledgeReview')}
            description={`${props.knowledgeAiCount} ${props.t('recommendationsReady')}`}
            action={<Button className="cursor-pointer" size="sm" disabled={props.busy || props.dirty || props.knowledgeAiCount === 0} onClick={props.onAcceptAllKnowledge}><Sparkles aria-hidden className="size-4"/>{props.t('applyAllAiRecommendations')}</Button>}
          >
            {props.knowledgeLines.map((line) => props.renderLine(line, false))}
          </ReviewSection>}
          {props.unmatchedLines.length > 0 && <ReviewSection
            title={props.t('unmatchedReview')}
            description={`${props.webAiCount} ${props.t('webRecommendationsReady')}`}
            action={<Button className="cursor-pointer" size="sm" disabled={props.busy || props.dirty || props.webAiCount === 0} onClick={props.onAcceptAllWeb}><Sparkles aria-hidden className="size-4"/>{props.t('applyAllAiRecommendations')}</Button>}
          >
            {props.unmatchedLines.map((line) => props.renderLine(line, false))}
          </ReviewSection>}
          {!reviewCount && <EmptyState
            icon={<Check aria-hidden className="size-6 text-success"/>}
            title={props.quotation.status === 'applied' ? props.t('applied') : props.t('reviewComplete')}
            action={props.canApply && <Button className="cursor-pointer" size="sm" onClick={props.onApply}>{props.t('apply')}</Button>}
          />}
        </div>
      </ScrollArea>
    </>}
  </TabsContent>
}

export function ApprovedReviewPanel({ t, quotation, lines, renderLine }: {
  t: Translate
  quotation?: Quotation
  lines: Line[]
  renderLine: (line: Line, reviewed: boolean) => React.ReactNode
}) {
  return <TabsContent value="approved" className="col-start-2 row-start-2 m-3 min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm data-[state=active]:grid data-[state=active]:grid-rows-[auto_minmax(0,1fr)] max-[1100px]:col-start-1 max-[1100px]:row-start-3 max-[1100px]:m-2">
    {!quotation ? <EmptyState icon={<Check aria-hidden className="size-7"/>} title={t('noQuotation')}/> : <>
      <PanelHeader title={t('approvedTab')} description={t('approvedHint')} count={lines.length}/>
      <ScrollArea className="min-h-0 bg-muted/20">
        <div className="mx-auto grid max-w-[1560px] gap-4 p-4">
          {lines.length ? lines.map((line) => renderLine(line, true)) : <EmptyState icon={<Check aria-hidden className="size-6 text-success"/>} title={t('approvedComplete')}/>}
        </div>
      </ScrollArea>
    </>}
  </TabsContent>
}

function PanelHeader({ title, description, count }: { title: string; description: string; count: number }) {
  return <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
    <div><strong className="block text-sm font-semibold">{title}</strong><span className="block text-[11px] text-muted-foreground">{description}</span></div>
    <Badge variant="outline">{count}</Badge>
  </header>
}

function ReviewSection({ title, description, action, children }: {
  title: string
  description: string
  action: React.ReactNode
  children: React.ReactNode
}) {
  return <section className="grid gap-3">
    <header className="flex min-h-10 items-center justify-between gap-3">
      <div><strong className="block text-sm">{title}</strong><span className="text-[11px] text-muted-foreground">{description}</span></div>
      {action}
    </header>
    <div className="grid gap-4">{children}</div>
  </section>
}
