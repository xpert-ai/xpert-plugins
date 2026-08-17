import * as React from 'react'
import { ExternalLink, EyeOff, Redo2, Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  cn
} from '@xpert-ai/plugin-shadcn-ui'
import type { Line } from '../view-data'
import {
  formatScore,
  hasKnowledgeRecommendation,
  hasWebRecommendation,
  isHttpUrl,
  resolveLineKnowledgeEvidence,
  shortSheetName,
  type Translate
} from '../presentation'
import { LineStatus } from './ui-helpers'
import { QuotaEvidencePanel, ResourcePricingPanel } from './quota-and-pricing'

export type ReviewItemProps = {
  line: Line
  busy: boolean
  t: Translate
  onAcceptAi: () => void
  onManual: (price: string) => void
  onSkip: () => void
  onReopen: () => void
  onSearchQuota: () => void
  onChooseQuotaCandidate: (candidateId: string) => void
  onSearchResourcePrice: (resourceId: string) => void
  onSearchResourceConsumption: (resourceId: string) => void
  onSearchAllResourcePrices: () => void
  onChooseResourcePrice: (resourceId: string, candidateId: string, priceItemId: string, label: string, sourceWorkdayHours?: number) => void
  onCalculate: () => void
  onApplyLine: () => void
  reviewed: boolean
}

export function ReviewItem({ line, busy, t, onAcceptAi, onManual, onSkip, onReopen, onSearchQuota, onChooseQuotaCandidate, onSearchResourcePrice, onSearchResourceConsumption, onSearchAllResourcePrices, onChooseResourcePrice, onCalculate, onApplyLine, reviewed }: ReviewItemProps) {
  const knowledgeRecommendation = hasKnowledgeRecommendation(line)
  const webRecommendation = hasWebRecommendation(line)
  const knowledgeEvidence = knowledgeRecommendation ? resolveLineKnowledgeEvidence(line) : null
  const hasRecommendation = knowledgeRecommendation || webRecommendation
  const [manualPrice, setManualPrice] = React.useState(knowledgeRecommendation || webRecommendation ? line.aiRecommendedUnitPrice ?? '' : '')
  const validManualPrice = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(manualPrice.trim())
  const ignored = line.matchStatus === 'ignored'

  React.useEffect(() => {
    if ((knowledgeRecommendation || webRecommendation) && line.aiRecommendedUnitPrice != null) setManualPrice(line.aiRecommendedUnitPrice)
  }, [knowledgeRecommendation, webRecommendation, line.aiRecommendedUnitPrice])

  return <Card className={cn('gap-0 overflow-hidden border-l-2 border-l-primary/45 py-0 shadow-sm', ignored && 'opacity-75')}>
    <CardHeader className="grid gap-3 border-b border-border bg-muted/25 px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-primary">01</span>
        <span className="text-[11px] font-semibold text-muted-foreground">工程项目</span>
        <LineStatus status={line.matchStatus} reviewState={line.reviewState} t={t}/>
      </div>
      <h3 className="break-words text-base font-bold leading-6">{line.name}</h3>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{line.code || t('noCode')}</span>
        <span>{shortSheetName(line.sheetName, t)} · {t('row')} {line.rowNumber}</span>
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-md:grid-cols-2">
        <div className="rounded-md border border-border/70 bg-background p-2 max-md:col-span-2">
          <dt className="text-[10px] text-muted-foreground">项目特征 / 规格</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">{line.specification || t('none')}</dd>
        </div>
        <Metric label="计量单位" value={line.unit || t('none')}/>
        <Metric label="工程量" value={line.quantity || t('none')}/>
      </dl>
      {line.materialReferenceOnly && <Badge variant="outline" className="w-fit">{t('materialReference')}</Badge>}
    </CardHeader>

    {line.kind === 'bill' && !line.materialReferenceOnly && (
      <QuotaEvidencePanel line={line} busy={busy} t={t} onSearch={onSearchQuota} onChooseQuotaCandidate={onChooseQuotaCandidate} reviewed={reviewed}/>
    )}
    <ResourcePricingPanel
      line={line}
      busy={busy}
      t={t}
      onSearch={onSearchResourcePrice}
      onSearchAll={onSearchAllResourcePrices}
      onChooseResourcePrice={onChooseResourcePrice}
      onChooseQuotaCandidate={onChooseQuotaCandidate}
      onCalculate={onCalculate}
      onApplyLine={onApplyLine}
      onSearchResourceConsumption={onSearchResourceConsumption}
      reviewed={reviewed}
    />

    {(line.matchEvidence || hasRecommendation || ignored || !reviewed) && <CardContent className="grid gap-3 border-t border-border px-4 py-4">
      {line.matchEvidence && <p className="text-xs leading-5 text-muted-foreground">{line.matchEvidence}</p>}
      {hasRecommendation && <section className="grid gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="gap-1"><Sparkles aria-hidden className="size-3"/>{webRecommendation ? t('aiWebRecommendation') : t('aiKnowledgeRecommendation')}</Badge>
          <span className="text-[11px] text-muted-foreground">{t('confidence')} {Math.round((line.aiConfidence ?? 0) * 100)}%</span>
        </div>
        <strong className="break-words text-xs leading-5">
          {knowledgeRecommendation ? `${line.aiMatchedMaterialName || line.name} · ${line.aiMatchedSpecification || line.specification || t('none')} · ` : `${line.name} · `}
          {line.aiRecommendedSourceUnit || line.unit || t('none')} · ¥{line.aiRecommendedUnitPrice}
        </strong>
        {line.aiUnitConversion && line.aiUnitConversion.factor !== '1' && <small className="text-[10px] text-muted-foreground">{line.aiRecommendedSourceUnitPrice ? `来源 ¥${line.aiRecommendedSourceUnitPrice}/${line.aiUnitConversion.sourceUnit}` : ''} · {line.aiUnitConversion.formula}</small>}
        {line.aiRationale && <p className="text-xs leading-5 text-muted-foreground">{line.aiRationale}</p>}
        {Boolean(line.aiDifferences?.length) && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{line.aiDifferences?.map((difference, index) => <li key={`${line.id}-difference-${index}`}>{difference}</li>)}</ul>}
        {knowledgeEvidence && <div className="grid gap-1 border-t border-border pt-3">
          <span className="text-[10px] font-semibold text-muted-foreground">{t('knowledgeEvidence')}</span>
          <strong className="text-xs">{knowledgeEvidence.documentName || t('knowledgeDocument')}</strong>
          {knowledgeEvidence.quote && <p className="text-xs leading-5 text-muted-foreground">{knowledgeEvidence.quote}</p>}
          <small className="break-words text-[10px] leading-4 text-muted-foreground">{[
            knowledgeEvidence.knowledgebaseId ? `${t('knowledgeBaseId')} ${knowledgeEvidence.knowledgebaseId}` : '',
            knowledgeEvidence.documentId ? `${t('knowledgeDocumentId')} ${knowledgeEvidence.documentId}` : '',
            knowledgeEvidence.chunkId ? `${t('knowledgeChunkId')} ${knowledgeEvidence.chunkId}` : '',
            knowledgeEvidence.score != null ? `${t('knowledgeScore')} ${formatScore(knowledgeEvidence.score)}` : ''
          ].filter(Boolean).join(' · ')}</small>
        </div>}
        {Boolean(line.aiSources?.length) && <div className="grid gap-2 border-t border-border pt-3">
          <span className="text-[10px] font-semibold text-muted-foreground">{t('priceSources')}</span>
          {line.aiSources?.map((source, index) => <div className="grid gap-1 border-t border-dashed border-border pt-2 first:border-0 first:pt-0" key={`${line.id}-source-${index}`}>
            {isHttpUrl(source.url)
              ? <a className="inline-flex w-fit cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline" href={source.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="size-3"/>{source.title}</a>
              : <strong className="text-xs">{source.title}</strong>}
            {source.publishedAt && <time className="text-[10px] text-muted-foreground">{source.publishedAt}</time>}
            <p className="text-xs leading-5 text-muted-foreground">{source.quote}</p>
          </div>)}
        </div>}
        <Button className="w-full cursor-pointer" size="sm" disabled={busy || Boolean(line.materialReferenceOnly)} title={line.materialReferenceOnly ? t('referenceNoWrite') : undefined} onClick={onAcceptAi}>
          <Sparkles aria-hidden className="size-4"/>{line.materialReferenceOnly ? t('referenceNoWrite') : t('applyThisAiRecommendation')}
        </Button>
      </section>}

      {ignored ? <Button className="w-full cursor-pointer" variant="outline" size="sm" disabled={busy || reviewed} onClick={onReopen}>
        <Redo2 aria-hidden className="size-4"/>{t('reopen')}
      </Button> : !reviewed ? <>
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('manualPrice')}
            inputMode="decimal"
            placeholder={t('manualPricePlaceholder')}
            value={manualPrice}
            onChange={(event) => setManualPrice(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && validManualPrice && !busy) onManual(manualPrice.trim()) }}
          />
          <Button className="shrink-0 cursor-pointer" variant="outline" size="sm" disabled={busy || !validManualPrice} onClick={() => onManual(manualPrice.trim())}>{t('useManualPrice')}</Button>
        </div>
        <Button className="w-full cursor-pointer" variant="ghost" size="sm" disabled={busy} onClick={onSkip}><EyeOff aria-hidden className="size-4"/>{t('skip')}</Button>
      </> : null}
    </CardContent>}
  </Card>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-24 rounded-md border border-border/70 bg-background p-2">
    <dt className="text-[10px] text-muted-foreground">{label}</dt>
    <dd className="mt-1 break-words text-xs font-semibold">{value}</dd>
  </div>
}
