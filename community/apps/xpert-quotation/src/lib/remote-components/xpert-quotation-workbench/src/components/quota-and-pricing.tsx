import * as React from 'react'
import { Archive, Calculator, Check, Search } from 'lucide-react'
import { Badge, Button, Card, CardContent, Separator, cn } from '@xpert-ai/plugin-shadcn-ui'
import type { Line, QuotaKnowledgeCandidate } from '../view-data'
import {
  consumptionCandidatesForResource,
  hasComprehensiveRateCalculation,
  lineComprehensiveUnitPrice,
  lineExcelApplyBlockReason,
  lineExcelApplyBlockText,
  resourceMatches,
  resourcePriceStatusLabel,
  type Translate
} from '../presentation'
import { SectionHeading } from './ui-helpers'

export function QuotaEvidencePanel({ line, busy, t, onSearch, onChooseQuotaCandidate, reviewed = false }: {
  line: Line
  busy: boolean
  t: Translate
  onSearch: () => void
  onChooseQuotaCandidate: (candidateId: string) => void
  reviewed?: boolean
}) {
  const candidates = line.quotaCandidates ?? []
  const selectedIds = new Set((line.quotaBreakdown?.components ?? []).map((component) => component.candidateId))
  const selected = candidates.filter((candidate) => selectedIds.has(candidate.id))
  const selectedComponents = (line.quotaBreakdown?.components ?? [])
    .filter((component) => selectedIds.has(component.candidateId) && !candidates.some((candidate) => candidate.id === component.candidateId))
    .map((component): QuotaKnowledgeCandidate => ({
      id: component.candidateId,
      knowledgebaseId: component.knowledgebaseId,
      documentId: component.documentId,
      chunkId: component.chunkId,
      quotaCode: component.quotaCode,
      quotaName: component.quotaName,
      quotaUnit: component.quotaUnit,
      extractionStatus: component.sourceIngestionReady === false ? 'partial' : 'structured',
      sourcePages: component.sourcePages,
      workContents: [],
      resources: component.resources,
      sourceKind: component.sourceKind === 'web' ? 'web' : 'knowledgebase',
      externalSources: component.externalSources
    }))
  const selectedCandidateIds = new Set(selected.map((candidate) => candidate.id))
  const visible = [
    ...selected,
    ...selectedComponents,
    ...candidates.filter((candidate) => !selectedCandidateIds.has(candidate.id) && !selectedComponents.some((item) => item.id === candidate.id))
  ].slice(0, 5)
  return <CardContent className="grid gap-3 border-t border-border px-4 py-4">
    <SectionHeading
      step="02"
      title={t('quotaEvidence')}
      description={visible.length ? `${t('quotaCandidates')} ${visible.length}` : t('quotaSearchNotRun')}
      actions={<Button className="cursor-pointer" size="sm" variant="outline" disabled={busy || reviewed} onClick={onSearch}>
        <Search aria-hidden className="size-3.5"/>{line.quotaSearchedAt ? t('retryQuotaCandidates') : t('searchQuotaCandidates')}
      </Button>}
    />
    {!visible.length && <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
      点击检索，按项目名称和项目特征规格查找最多 5 个定额候选；直接材料采购项会转为材料资源价格候选。
    </p>}
    {visible.map((candidate) => <article
      key={candidate.id}
      className={cn(
        'grid gap-2 rounded-md border border-border bg-background p-3',
        selectedIds.has(candidate.id) && 'border-l-4 border-primary/40 border-l-primary bg-primary/5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <strong className="min-w-0 break-words text-xs leading-5">{candidate.quotaCode || '消耗量'} {candidate.quotaName || '未命名消耗量'}</strong>
        <div className="flex shrink-0 items-center gap-1.5">
          {candidate.sourceKind === 'web' && <Badge variant="secondary">{t('webEvidence')}</Badge>}
          <Badge variant="outline">{candidate.quotaUnit || line.unit || '未识别单位'}</Badge>
        </div>
      </div>
      <small className="text-[10px] text-muted-foreground">
        {candidate.extractionStatus === 'structured' ? t('quotaStructured') : t('quotaPartial')}
        {candidate.sourcePages?.length ? ` · ${candidate.sourcePages.join(', ')}页` : ''}
      </small>
      {candidate.workContents?.length ? <p className="text-xs leading-5">{candidate.workContents.join('；')}</p> : null}
      {candidate.externalSources?.length ? <div className="grid gap-1.5 rounded-md border border-dashed border-border bg-muted/30 p-2">
        {candidate.externalSources.map((source) => <div className="grid gap-0.5" key={source.url}>
          <a className="break-all text-[10px] font-semibold text-primary underline-offset-2 hover:underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
          <p className="text-[10px] leading-4 text-muted-foreground">{source.quote}</p>
        </div>)}
      </div> : null}
      {candidate.resources?.length ? <div className="grid gap-1.5">
        {candidate.resources.map((resource) => <div
          key={`${candidate.id}-${resource.code}-${resource.unit}`}
          className="grid min-w-0 grid-cols-[auto_4rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-[10px] max-md:grid-cols-[auto_minmax(0,1fr)_auto]"
        >
          <Badge variant="outline">{resource.category}</Badge>
          <code className="truncate max-md:hidden">{resource.code}</code>
          <span className="break-words">{resource.name}</span>
          <b className="text-primary">{resource.consumptionPending ? '待补充' : resource.consumption}</b>
          <span className="text-muted-foreground">{resource.unit}</span>
        </div>)}
      </div> : <p className="text-xs text-muted-foreground">知识片段未解析出完整人材机消耗量，请人工核对原始表格。</p>}
      <Button
        className="w-full cursor-pointer text-[10px]"
        size="sm"
        variant={selectedIds.has(candidate.id) ? 'default' : 'outline'}
        disabled={busy || reviewed || selectedIds.has(candidate.id)}
        onClick={() => onChooseQuotaCandidate(candidate.id)}
      >
        {selectedIds.has(candidate.id) ? <><Check aria-hidden className="size-3"/>{t('quotaCandidateSelected')}</> : t('chooseQuotaCandidate')}
      </Button>
    </article>)}
  </CardContent>
}

export function ResourcePricingPanel({ line, busy, t, onSearch, onSearchAll, onChooseResourcePrice, onChooseQuotaCandidate, onCalculate, onApplyLine, onSearchResourceConsumption, reviewed }: {
  line: Line
  busy: boolean
  t: Translate
  onSearch: (resourceId: string) => void
  onSearchAll: () => void
  onChooseResourcePrice: (resourceId: string, candidateId: string, priceItemId: string, label: string, sourceWorkdayHours?: number) => void
  onChooseQuotaCandidate: (candidateId: string) => void
  onCalculate: () => void
  onApplyLine: () => void
  onSearchResourceConsumption: (resourceId: string) => void
  reviewed: boolean
}) {
  const resources = line.quotaPricingResources ?? []
  const stateByResource = new Map((line.quotaResourcePrices ?? []).map((state) => [state.resourceId, state]))
  const selectedResourceIds = new Set(selectedPricingResources(line).map((resource) => resource.id))
  const pendingCount = resources.filter((resource) => !stateByResource.get(resource.id) || stateByResource.get(resource.id)?.status === 'not_searched').length
  const categories = ['人工', '机械', '材料'] as const
  return <>
    <CardContent className="grid gap-4 border-t border-border px-4 py-4">
      <SectionHeading
        step="03"
        title="人机材价格"
        description="每类最多选用一项；新选择会替换同类旧选择"
        actions={<>
          <Badge variant="outline">{resources.length} 项资源</Badge>
          <Button className="cursor-pointer" size="sm" variant="outline" disabled={busy || pendingCount === 0} onClick={onSearchAll}>
            {t('searchAllResourcePrices')}
          </Button>
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {categories.map((category) => {
          const categoryResources = resources.filter((resource) => resource.category === category)
          return <section className="min-w-0 rounded-lg border border-border bg-muted/20 p-3" key={category}>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <span className="h-4 w-1 rounded-full bg-primary" aria-hidden/>{category}
            </h4>
            <div className="grid gap-3">
              {categoryResources.map((resource) => {
                const state = stateByResource.get(resource.id)
                const recommendation = state?.recommendation
                const matchedItems = (state?.candidates ?? []).flatMap((candidate) => candidate.matchedPriceItemIds.flatMap((priceItemId) => {
                  const item = candidate.priceItems.find((entry) => entry.id === priceItemId)
                  return item ? [{ candidate, item }] : []
                })).slice(0, 5)
                return <article className="grid gap-2 rounded-md border border-border bg-card p-3" key={resource.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><code className="block truncate text-[10px] text-muted-foreground">{resource.code}</code><strong className="break-words text-xs">{resource.name}</strong></div>
                    <Badge variant="outline" className="shrink-0">{resource.unit}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{resourcePriceStatusLabel(state?.status ?? 'not_searched', t)}</span>
                    <Button className="h-7 cursor-pointer px-2 text-[10px]" size="sm" variant={state ? 'ghost' : 'outline'} disabled={busy} onClick={() => onSearch(resource.id)}>
                      {state && state.status !== 'not_searched' ? t('resourceRetryPrice') : t('searchResourcePrice')}
                    </Button>
                  </div>
                  {state?.status === 'no_match' && <p className="rounded bg-destructive-background p-2 text-[10px] leading-4 text-destructive">{t('resourceNoStructuredPrice')}</p>}
                  {matchedItems.map(({ candidate, item }) => {
                    const accepted = selectedResourceIds.has(resource.id) && recommendation?.candidateId === candidate.id && recommendation.priceItemId === item.id
                    return <div key={`${candidate.id}-${item.id}`} className={cn('grid gap-1.5 border-t border-dashed border-border pt-2', accepted && 'rounded bg-success-background p-2')}>
                      <div className="flex items-start justify-between gap-2"><strong className="text-[11px]">{item.name}</strong><b className="shrink-0 text-[11px] text-primary">¥{item.unitPrice}/{item.unit}</b></div>
                      {candidate.documentId?.startsWith('http')
                        ? <a className="break-all text-[9px] leading-4 text-primary hover:underline" href={candidate.documentId} target="_blank" rel="noreferrer">{candidate.documentName || candidate.documentId}</a>
                        : <small className="text-[9px] leading-4 text-muted-foreground">{candidate.documentName || candidate.documentId || candidate.knowledgebaseId}</small>}
                      <p className="text-[10px] leading-4 text-muted-foreground">{item.evidenceQuote}</p>
                      <Button className="h-7 w-full cursor-pointer text-[10px]" size="sm" variant={accepted ? 'default' : 'outline'} disabled={busy || accepted} onClick={() => onChooseResourcePrice(resource.id, candidate.id, item.id ?? '', `${item.name} · ¥${item.unitPrice}/${item.unit}`, item.workdayHours)}>
                        {accepted ? <><Check aria-hidden className="size-3"/>{t('resourcePriceAccepted')}</> : t('chooseResourcePrice')}
                      </Button>
                    </div>
                  })}
                  {recommendation && <p className={cn('text-[10px] font-semibold', selectedResourceIds.has(resource.id) ? 'text-success' : 'text-muted-foreground')}>
                    {selectedResourceIds.has(resource.id) ? '当前选用' : '候选价格'} ¥{recommendation.normalizedUnitPrice}/{resource.unit}
                  </p>}
                </article>
              })}
              {!categoryResources.length && <p className="py-4 text-center text-[11px] text-muted-foreground">暂无{category}资源</p>}
            </div>
          </section>
        })}
      </div>
    </CardContent>
    <ResourceConsumptionPanel line={line} busy={busy} t={t} onSearch={onSearchResourceConsumption} onChooseQuotaCandidate={onChooseQuotaCandidate} reviewed={reviewed}/>
    <PricingFormulaPanel line={line} t={t}/>
    <PricingCalculationAction line={line} busy={busy} onCalculate={onCalculate} onApplyLine={onApplyLine}/>
  </>
}

function ResourceConsumptionPanel({ line, busy, t, onSearch, onChooseQuotaCandidate, reviewed }: {
  line: Line
  busy: boolean
  t: Translate
  onSearch: (resourceId: string) => void
  onChooseQuotaCandidate: (candidateId: string) => void
  reviewed: boolean
}) {
  const resources = line.quotaPricingResources ?? []
  const directMaterial = line.materialReferenceOnly === true && resources.length > 0 && resources.every((resource) => resource.category === '材料')
  const selectedCandidateIds = new Set((line.quotaBreakdown?.components ?? []).map((component) => component.candidateId))
  const categories = ['人工', '机械', '材料'] as const
  return <CardContent className="grid gap-4 border-t border-border px-4 py-4">
    <SectionHeading
      step="04"
      title={directMaterial ? '材料计价资源' : '人机材消耗量'}
      description={directMaterial ? '直接材料按清单工程量计价，不套用施工消耗量定额' : '按选定定额的单位工程量展示'}
      actions={<Badge variant="outline">{resources.length} 项资源</Badge>}
    />
    {directMaterial ? <p className="rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
      该行已按材料采购分流；内部按 1 个清单计量单位承载材料单价，合价使用清单工程量计算。
    </p> : <div className="grid gap-3 lg:grid-cols-3">
      {categories.map((category) => <section className="rounded-lg border border-border bg-muted/20 p-3" key={category}>
        <h4 className="mb-2 text-xs font-semibold">{category}</h4>
        {resources.filter((resource) => resource.category === category).map((resource) => {
          const candidates = consumptionCandidatesForResource(line, resource)
          const searched = Boolean(line.quotaSearchedAt)
          return <article className="grid gap-2 border-t border-dashed border-border py-3 first:border-0 first:pt-0" key={resource.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><strong className="block break-words text-[11px]">{resource.name}</strong><code className="text-[9px] text-muted-foreground">{resource.code}</code></div>
              <b className="shrink-0 text-xs text-primary">{resource.consumptionPending ? t('consumptionPending') : resource.consumption}</b>
            </div>
            <span className="text-[9px] text-muted-foreground">{resource.unit} / {resource.quotaUnit}</span>
            <Button className="h-7 w-full cursor-pointer text-[10px]" size="sm" variant="outline" disabled={busy || reviewed} onClick={() => onSearch(resource.id)}>
              <Search aria-hidden className="size-3"/>{searched ? t('retryResourceConsumption') : t('searchResourceConsumption')}
            </Button>
            {candidates.map((candidate) => {
              const match = (candidate.resources ?? []).find((item) => resourceMatches(item, resource))
              const selected = selectedCandidateIds.has(candidate.id)
              return <div className={cn('grid gap-2 rounded border p-2', selected ? 'border-success/30 bg-success-background' : 'border-primary/20 bg-primary/5')} key={`${resource.id}-${candidate.id}`}>
                <strong className="block text-[10px]">{candidate.quotaCode || '消耗量定额'} {candidate.quotaName || '未命名'}</strong>
                <small className="text-[9px] leading-4 text-muted-foreground">{candidate.documentName || candidate.documentId || candidate.knowledgebaseId}</small>
                {match && <p className="mt-1 text-[10px]"><b className="text-primary">{match.consumptionPending ? t('consumptionPending') : match.consumption}</b> {match.unit} · {match.name}</p>}
                <Button className="h-7 w-full cursor-pointer text-[10px]" size="sm" variant={selected ? 'default' : 'outline'} disabled={busy || reviewed || selected} onClick={() => onChooseQuotaCandidate(candidate.id)}>
                  {selected ? <><Check aria-hidden className="size-3"/>{t('quotaCandidateSelected')}</> : t('chooseQuotaCandidate')}
                </Button>
              </div>
            })}
          </article>
        })}
        {!resources.some((resource) => resource.category === category) && <p className="py-3 text-center text-[10px] text-muted-foreground">暂无{category}消耗量</p>}
      </section>)}
    </div>}
  </CardContent>
}

function PricingFormulaPanel({ line, t }: { line: Line; t: Translate }) {
  const allResources = line.quotaPricingResources ?? []
  const resources = selectedPricingResources(line)
  const prices = new Map((line.quotaResourcePrices ?? []).map((state) => [state.resourceId, state]))
  const costs = new Map((line.pricingCalculation?.resourceCosts ?? []).map((cost) => [cost.resourceId, cost]))
  const hasUnpricedResources = Boolean(line.pricingCalculation?.unpricedResourceIds?.length)
  const comprehensiveUnitPrice = lineComprehensiveUnitPrice(line)
  return <CardContent className="grid gap-4 border-t border-border px-4 py-4">
    <SectionHeading step="05" title="综合单价计算" description="仅计算前一步选用的人工、机械、材料各一项" actions={line.pricingCalculation && <Badge>已计算</Badge>}/>
    <div className="grid gap-2">
      {resources.map((resource) => {
        const recommendation = prices.get(resource.id)?.recommendation
        const cost = costs.get(resource.id)
        return <div className="grid grid-cols-[minmax(0,1fr)_minmax(12rem,1.2fr)_auto] items-center gap-3 border-b border-dashed border-border py-2 text-xs max-md:grid-cols-[minmax(0,1fr)_auto]" key={resource.id}>
          <span className="break-words">{resource.name}</span>
          <code className="break-words text-[10px] text-muted-foreground max-md:row-start-2 max-md:col-span-2">{resource.consumptionPending ? t('consumptionPending') : resource.consumption} × {recommendation?.normalizedUnitPrice ? `¥${recommendation.normalizedUnitPrice}/${resource.unit}` : `¥0/${resource.unit}`}</code>
          <b className="text-primary">{cost ? `¥${cost.costPerBillUnit}/${line.unit}` : '—'}</b>
        </div>
      })}
      {!resources.length && <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">请先在人机材价格区域选用资源；每类最多选择一项</p>}
      {allResources.length > 0 && resources.length === 0 && line.pricingCalculation ? <p className="text-xs text-warning">当前计算没有可用的已批准资源，请重新选择后计算。</p> : null}
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t-2 border-foreground/20 pt-3 text-sm">
        <strong>综合单价</strong>
        <strong className="text-primary">
          {comprehensiveUnitPrice ? `¥${comprehensiveUnitPrice}/${line.unit || '单位'}` : '计算后显示'}
        </strong>
      </div>
    </div>
    {line.pricingCalculation && <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg border border-success/20 bg-success-background p-3 text-xs">
      <span className="text-muted-foreground">人工费</span><b>¥{line.pricingCalculation.directCosts.labor}/{line.unit}</b>
      <span className="text-muted-foreground">机械费</span><b>¥{line.pricingCalculation.directCosts.machine}/{line.unit}</b>
      <span className="text-muted-foreground">材料费</span><b>¥{line.pricingCalculation.directCosts.material}/{line.unit}</b>
      <Separator className="col-span-2"/>
      <strong className="text-success">综合单价</strong><strong className="text-success">¥{line.pricingCalculation.comprehensiveUnitPrice}/{line.unit}</strong>
      <strong className="text-success">{line.quantity} × 综合单价</strong><strong className="text-success">¥{line.pricingCalculation.totalAmount}</strong>
    </div>}
    {line.pricingCalculation?.calculationWarnings?.length ? <p className="rounded-md bg-warning/10 p-3 text-xs text-warning">
      {line.pricingCalculation.calculationWarnings.join('；')}{hasUnpricedResources ? '；当前结果为部分计价，可填入 Excel，后续补齐价格后请重新计算。' : ''}
    </p> : null}
  </CardContent>
}

function selectedPricingResources(line: Line) {
  const resources = line.quotaPricingResources ?? []
  const states = new Map((line.quotaResourcePrices ?? []).map((state) => [state.resourceId, state]))
  return (['人工', '机械', '材料'] as const).flatMap((category) => {
    const approved = resources
      .map((resource, index) => ({ resource, state: states.get(resource.id), index }))
      .filter((item) => item.resource.category === category && item.state?.status === 'approved' && Boolean(item.state.recommendation))
      .sort((left, right) => pricingSelectionTime(right.state?.reviewedAt, right.state?.recommendation?.recommendedAt) - pricingSelectionTime(left.state?.reviewedAt, left.state?.recommendation?.recommendedAt) || right.index - left.index)
    return approved[0]?.resource ? [approved[0].resource] : []
  })
}

function pricingSelectionTime(reviewedAt?: string, recommendedAt?: string) {
  const value = Date.parse(reviewedAt ?? recommendedAt ?? '')
  return Number.isFinite(value) ? value : 0
}

function PricingCalculationAction({ line, busy, onCalculate, onApplyLine }: {
  line: Line
  busy: boolean
  onCalculate: () => void
  onApplyLine: () => void
}) {
  const ready = Boolean(line.quotaBreakdown && line.quantity && line.unit)
  const calculated = hasComprehensiveRateCalculation(line)
  const blockReason = lineExcelApplyBlockReason(line)
  const canWrite = calculated && !blockReason
  const comprehensiveUnitPrice = lineComprehensiveUnitPrice(line)
  const totalAmount = line.pricingCalculation?.totalAmount ?? line.calculatedAmount
  const resultText = calculated && comprehensiveUnitPrice && totalAmount
    ? blockReason
      ? lineExcelApplyBlockText(blockReason)
      : `${line.pricingCalculation?.unpricedResourceIds?.length ? '部分计价：' : ''}综合单价 ¥${comprehensiveUnitPrice}/${line.unit || '单位'}，合价 ¥${totalAmount}，可写入 Excel。`
    : '先选择并批准资源价格，再计算综合单价。'
  return <CardContent className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 px-4 py-4 max-sm:grid-cols-1">
    <Button className="cursor-pointer" size="sm" disabled={busy || !ready} onClick={onCalculate}><Calculator aria-hidden className="size-4"/>{calculated ? '重新计算综合单价' : '计算综合单价'}</Button>
    <Button className="cursor-pointer" size="sm" variant="outline" disabled={busy || !canWrite} onClick={onApplyLine}><Archive aria-hidden className="size-4"/>填入 Excel</Button>
    <small className="col-span-2 text-center text-[10px] leading-4 text-muted-foreground max-sm:col-span-1">{resultText}</small>
  </CardContent>
}
