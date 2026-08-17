import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Tabs, TooltipProvider } from '@xpert-ai/plugin-shadcn-ui'
import { translator } from './i18n'
import {
  errorMessage,
  executeAction,
  executeFileAction,
  invokeClientCommand,
  notify,
  payload,
  reportResize,
  requestData,
  startBridge,
  type RemoteViewContext
} from './runtime'
import { buildAiReviewPrompt } from '../../../ai-review-prompt'
import {
  workbenchContextFingerprint,
  type QuotationWorkbenchContext,
  type QuotationWorkbenchView
} from './workbench-context'
import {
  normalizeKnowledgeData,
  normalizeWorkbenchData,
  type KnowledgeSearchData,
  type Line,
  type WorkbenchData
} from './view-data'
import {
  canApplyLineToExcel,
  hasKnowledgeRecommendation,
  hasComprehensiveRateCalculation,
  hasWebRecommendation,
  isApprovedLine,
  isPendingLine,
  lineExcelApplyBlockReason,
  lineExcelApplyBlockText,
  resolveText,
  type CalculationTarget,
  type DeleteTarget,
  type ExcelOverwriteTarget,
  type OfficeSpreadsheetHandle,
  type ResourcePriceTarget,
  type WorkbenchTab
} from './presentation'
import { WorkbenchHeader } from './components/workbench-header'
import { QuotationPanel } from './components/quotation-panel'
import { PendingReviewPanel, ApprovedReviewPanel } from './components/review-panels'
import { KnowledgePanel } from './components/knowledge-panel'
import { ReviewItem } from './components/review-item'
import { WorkbenchDialogs } from './components/confirmation-dialogs'
import { firstSnapshotSheetName } from './components/office-spreadsheet-host'

type QuotationImportActionResult = { data?: { quotation?: { id?: string } } }
type ActionResultData = {
  fileUrl?: string
  status?: string
  expectedVersionNumber?: number
  occupiedCellCount?: number
  occupiedCells?: Array<{ sheetName?: string; address?: string }>
  occupiedCellsTruncated?: boolean
}
type WorkbenchActionResult = { success?: boolean; message?: unknown; data?: ActionResultData; fileUrl?: string }

function App() {
  const [context, setContext] = React.useState<RemoteViewContext>({ initialQuery: {} })
  const [data, setData] = React.useState<WorkbenchData>({ quotations: [], undo: { available: false }, detail: null })
  const [quotationId, setQuotationId] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<WorkbenchTab>('quotation')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [editorContextVersion, setEditorContextVersion] = React.useState(0)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [resourcePriceTarget, setResourcePriceTarget] = React.useState<ResourcePriceTarget | null>(null)
  const [quotaWorkdayHours, setQuotaWorkdayHours] = React.useState('')
  const [calculationTarget, setCalculationTarget] = React.useState<CalculationTarget | null>(null)
  const [excelOverwriteTarget, setExcelOverwriteTarget] = React.useState<ExcelOverwriteTarget | null>(null)
  const [knowledge, setKnowledge] = React.useState<KnowledgeSearchData>({ items: [], summary: { knowledgebases: [], queryRequired: true } })
  const [knowledgebaseId, setKnowledgebaseId] = React.useState('')
  const [knowledgeSearch, setKnowledgeSearch] = React.useState('')
  const [knowledgeQuery, setKnowledgeQuery] = React.useState('')
  const [knowledgeLoading, setKnowledgeLoading] = React.useState(false)
  const [knowledgeLoaded, setKnowledgeLoaded] = React.useState(false)
  const editorRef = React.useRef<OfficeSpreadsheetHandle | null>(null)
  const knowledgeRequest = React.useRef(0)
  const lastAssistantContext = React.useRef('')
  const quotationIdRef = React.useRef('')
  const t = translator(context.locale)

  const load = React.useCallback(async (targetId?: string) => {
    const response = await requestData(targetId ? { parameters: { quotationId: targetId } } : {})
    const next = normalizeWorkbenchData(payload(response))
    setData(next)
    setQuotationId(next.detail?.quotation.id ?? '')
  }, [])

  const loadKnowledge = React.useCallback(async (options?: { search?: string; knowledgebaseId?: string }) => {
    const query = options?.search ?? knowledgeSearch.trim()
    const selectedKnowledgebaseId = options?.knowledgebaseId ?? knowledgebaseId
    const requestId = ++knowledgeRequest.current
    setKnowledgeLoading(true)
    try {
      const response = await requestData({ search: query, parameters: { table: 'knowledgeSearch', knowledgebaseId: selectedKnowledgebaseId } })
      if (requestId !== knowledgeRequest.current) return
      const next = normalizeKnowledgeData(payload(response))
      const resolvedKnowledgebaseId = next.summary.activeKnowledgebaseId
        ?? (next.summary.knowledgebases.some((item) => item.id === selectedKnowledgebaseId) ? selectedKnowledgebaseId : '')
        ?? next.summary.knowledgebases[0]?.id
        ?? ''
      setKnowledge(next)
      setKnowledgebaseId(resolvedKnowledgebaseId || next.summary.knowledgebases[0]?.id || '')
      setKnowledgeQuery(query)
      setKnowledgeLoaded(true)
    } catch (error) {
      if (requestId === knowledgeRequest.current) notify('error', errorMessage(error))
    } finally {
      if (requestId === knowledgeRequest.current) setKnowledgeLoading(false)
    }
  }, [knowledgeSearch, knowledgebaseId])

  function selectTab(value: string) {
    const tab = value as WorkbenchTab
    setActiveTab(tab)
    if (tab === 'knowledge' && !knowledgeLoaded) void loadKnowledge({ search: '' })
    window.setTimeout(() => {
      if (tab !== 'knowledge') window.dispatchEvent(new Event('resize'))
      reportResize()
    }, 0)
  }

  const detail = data.detail
  const quotation = detail?.quotation
  const lines = detail?.lines ?? []
  const snapshotId = detail?.officeDocument?.currentSnapshot?.id ?? ''

  const syncWorkbenchContext = React.useCallback(async () => {
    const snapshot = detail?.officeDocument?.currentSnapshot?.snapshot
    const fallbackSheetName = snapshot && typeof snapshot === 'object' ? firstSnapshotSheetName(snapshot) : undefined
    const activeSheetName = editorRef.current?.getActiveSheetName?.() || fallbackSheetName
    const selectedRange = editorRef.current?.getSelectedRange?.()
    const next: QuotationWorkbenchContext = {
      ...(quotationId ? { quotationId } : {}),
      ...(quotation?.title ? { quotationTitle: quotation.title } : {}),
      ...(detail?.officeFile?.fileName ? { fileName: detail.officeFile.fileName } : {}),
      ...(quotation?.officeVersionNumber ? { officeVersionNumber: quotation.officeVersionNumber } : {}),
      activeView: activeTab as QuotationWorkbenchView,
      ...(activeSheetName ? { activeSheetName } : {}),
      ...(selectedRange ? { selectedRange } : {}),
      dirty,
      ...(snapshotId ? { currentSnapshotId: snapshotId } : {})
    }
    const fingerprint = workbenchContextFingerprint(next)
    if (!next.quotationId || fingerprint === lastAssistantContext.current) return
    lastAssistantContext.current = fingerprint
    await invokeClientCommand('assistant.context.set', { key: 'xpert_quotation_workbench', context: next }).catch(() => undefined)
  }, [activeTab, detail?.officeDocument?.currentSnapshot?.snapshot, detail?.officeFile?.fileName, dirty, editorContextVersion, quotation, quotationId, snapshotId])

  React.useEffect(() => { quotationIdRef.current = quotationId }, [quotationId])
  React.useEffect(() => {
    startBridge((next) => {
      setContext(next)
      void load().catch((error) => notify('error', errorMessage(error)))
    }, () => void load(quotationIdRef.current).catch(() => undefined))
  }, [load])
  React.useEffect(() => { void syncWorkbenchContext() }, [syncWorkbenchContext])
  React.useEffect(() => { setDirty(false) }, [quotationId, snapshotId])
  React.useEffect(() => { window.setTimeout(reportResize, 0) }, [data, activeTab, knowledge])

  const unresolvedLines = lines.filter(isPendingLine)
  const knowledgeReviewLines = unresolvedLines.filter(hasKnowledgeRecommendation)
  const unmatchedReviewLines = unresolvedLines.filter((line) => !hasKnowledgeRecommendation(line))
  const approvedLines = lines.filter(isApprovedLine)
  const knowledgeAiCount = knowledgeReviewLines.length
  const webAiCount = unmatchedReviewLines.filter(hasWebRecommendation).length
  const pendingApplyCount = lines.filter(canApplyLineToExcel).length
  const canApply = Boolean(quotation && pendingApplyCount > 0 && !dirty)

  async function uploadFile(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      const response = await executeFileAction('import_source_xlsx', file)
      const actionResult = payload<QuotationImportActionResult>(response)
      notify('success', t('sourceImported'))
      await load(actionResult.data?.quotation?.id)
    } catch (error) {
      notify('error', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function runAction(actionKey: string, input: Record<string, unknown>, options?: { silentError?: boolean }) {
    setBusy(true)
    try {
      const response = await executeAction(actionKey, quotationId, input)
      const result = payload<WorkbenchActionResult>(response)
      if (result?.success === false) throw new Error(resolveText(result.message, context.locale) || t('operationFailed'))
      if (actionKey === 'apply_patch' && result.data?.status === 'overwrite_required') return result
      notify('success', resolveText(result?.message, context.locale) || t('operationComplete'))
      if (actionKey === 'export_xlsx') {
        const file = result.data ?? result
        if (file?.fileUrl) window.open(file.fileUrl, '_blank', 'noopener,noreferrer')
      } else {
        await load(actionKey === 'delete_quotation' || actionKey === 'undo_last' ? undefined : quotationId)
        if (actionKey === 'apply_patch') setActiveTab('approved')
      }
      return result
    } catch (error) {
      if (!options?.silentError) notify('error', errorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function delegateResourcePriceSearch(line: Line, resourceIds: string[]) {
    const resources = (line.quotaPricingResources ?? []).filter((resource) => resourceIds.includes(resource.id)).map((resource) => ({
      resourceId: resource.id,
      category: resource.category,
      code: resource.code,
      name: resource.name,
      aliases: resource.aliases,
      unit: resource.unit,
      quotaUnit: resource.quotaUnit,
      consumption: resource.consumption,
      consumptionPending: resource.consumptionPending === true
    }))
    if (!resources.length) return
    try {
      await invokeClientCommand('assistant.chat.send_message', {
        text: [
          '报价审核区请求补检索当前清单行的资源价格。',
          JSON.stringify({ quotationId, lineId: line.id, lineNumber: line.rowNumber, billCode: line.code ?? null, billName: line.name, specification: line.specification ?? null, unit: line.unit ?? null, quantity: line.quantity ?? null, discipline: line.discipline, mode: 'resource_price', ...(resources.length === 1 ? { resource: resources[0] } : { resources }), resourceIds: resources.map((resource) => resource.resourceId) }),
          '当前宿主 Worker 不连接知识库或 WebTools。请把这条任务交给逐行报价 Worker，再由其下价格检索子 Agent 优先执行 xpert_quotation_search_resource_prices；没有价格知识库或无可靠候选时，必须调用 web_search/web_fetch，并用 xpert_quotation_recommend_web_resource_price 持久化包含真实 URL、原文价格和单位摘录的联网候选。每个资源最多保留 5 个候选，完成后不要审核、计算或写入 Excel。'
        ].join('\n'),
        clientMessageId: `xpert-quotation:price-retry:${line.id}:${Date.now()}`,
        state: { source: '@xpert-ai/plugin-xpert-quotation', action: 'delegate_resource_price_search', quotationId, lineId: line.id }
      })
      notify('info', '宿主 Agent 未连接价格库，已转交价格检索子 Agent；候选返回后将自动刷新。')
    } catch (error) {
      notify('error', errorMessage(error))
    }
  }

  async function delegateQuotaSearch(line: Line, resource?: NonNullable<Line['quotaPricingResources']>[number]) {
    try {
      const resourceTask = resource ? { resourceId: resource.id, category: resource.category, code: resource.code, name: resource.name, aliases: resource.aliases, unit: resource.unit, quotaUnit: resource.quotaUnit, consumption: resource.consumption, consumptionPending: resource.consumptionPending === true } : null
      await invokeClientCommand('assistant.chat.send_message', {
        text: [
          resource ? '报价审核区请求补检索当前人机材资源的消耗量。' : '报价审核区请求补检索当前工程项目的消耗量定额。',
          JSON.stringify({ quotationId, lineId: line.id, lineNumber: line.rowNumber, billCode: line.code ?? null, billName: line.name, specification: line.specification ?? null, unit: line.unit ?? null, quantity: line.quantity ?? null, discipline: line.discipline, mode: resource ? 'resource_consumption' : 'line_consumption', resource: resourceTask }),
          '当前宿主 Worker 不连接消耗量知识库或 WebTools。请把这条单行任务交给逐行报价 Worker，再由其下消耗量检索子 Agent 优先执行 xpert_quotation_search_quota_components；没有消耗量知识库或无可靠候选时，必须调用 web_search/web_fetch 搜索工程做法、定额组成和人材机证据，再由 Worker 调用 xpert_quotation_recommend_web_quota_breakdown 持久化真实 URL 和原文摘录。网页未明确给出消耗量时必须标记 consumptionPending=true、consumption=0，禁止猜数。若指定了 resourceId，只更新该资源对应的完整定额提案。材料采购行请分流为直接材料资源。不要审核、计算或写入 Excel。'
        ].join('\n'),
        clientMessageId: `xpert-quotation:quota-retry:${line.id}:${resource?.id ?? 'line'}:${Date.now()}`,
        state: { source: '@xpert-ai/plugin-xpert-quotation', action: resource ? 'delegate_resource_consumption_search' : 'delegate_quota_search', quotationId, lineId: line.id, resourceId: resource?.id ?? null }
      })
      notify('info', resource ? '已转交消耗量检索子 Agent；该资源候选返回后将显示在按钮下方。' : '宿主 Agent 未连接消耗量库，已转交消耗量检索子 Agent；结果返回后将自动刷新。')
    } catch (error) {
      notify('error', errorMessage(error))
    }
  }

  async function confirmResourcePrice() {
    if (!resourcePriceTarget) return
    const target = resourcePriceTarget
    const parsedQuotaHours = target.sourceWorkdayHours != null ? Number(quotaWorkdayHours) : undefined
    const success = await runAction('accept_resource_price', {
      quotationId,
      lineId: target.lineId,
      resourceId: target.resourceId,
      candidateId: target.candidateId,
      priceItemId: target.priceItemId,
      ...(parsedQuotaHours != null ? { quotaWorkdayHours: parsedQuotaHours } : {}),
      confidence: 0.8,
      rationale: '在报价审核区选择了与消耗量资源名称、类别和单位兼容的知识库价格候选。',
      differences: [],
      comment: '用户在报价审核区确认采用当前资源价格和换算口径。',
      userConfirmed: true
    })
    if (success) setResourcePriceTarget(null)
  }

  async function confirmCalculation() {
    if (!calculationTarget) return
    const success = await runAction('calculate_comprehensive_rate', { quotationId, lineId: calculationTarget.lineId, unitPriceScale: 4, userConfirmed: true })
    if (success) setCalculationTarget(null)
  }

  async function chooseQuotaCandidate(line: Line, candidateId: string) {
    await runAction('select_quota_candidate', {
      quotationId,
      lineId: line.id,
      candidateId,
      userConfirmed: true
    })
  }

  async function applyLine(line: Line) {
    const blockReason = lineExcelApplyBlockReason(line)
    if (blockReason) {
      notify('warning', lineExcelApplyBlockText(blockReason))
      return
    }
    if (line.quotaBreakdown && !hasComprehensiveRateCalculation(line)) {
      notify('warning', '请先计算综合单价并确认结果，再填入 Excel。')
      return
    }
    await applyToExcel(line.id)
  }

  async function applyToExcel(lineId?: string) {
    const changeSummary = lineId
      ? '将当前报价项目的综合单价和合价写入 Excel。'
      : '应用已计算的人材机综合单价和合价。'
    const result = await runAction('apply_patch', { quotationId, ...(lineId ? { lineId } : {}), changeSummary, userConfirmed: true })
    const overwrite = toExcelOverwriteTarget(result?.data, changeSummary, lineId)
    if (overwrite) {
      setExcelOverwriteTarget(overwrite)
      return
    }
    if (result) setActiveTab('approved')
  }

  async function confirmExcelOverwrite() {
    if (!excelOverwriteTarget) return
    const target = excelOverwriteTarget
    const result = await runAction('apply_patch', {
      quotationId,
      ...(target.lineId ? { lineId: target.lineId } : {}),
      changeSummary: target.changeSummary,
      userConfirmed: true,
      overwriteExisting: true,
      expectedVersionNumber: target.expectedVersionNumber
    })
    if (result) {
      setExcelOverwriteTarget(null)
      setActiveTab('approved')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const success = await runAction('delete_quotation', { quotationId: deleteTarget.id, userConfirmed: true })
    if (success) setDeleteTarget(null)
  }

  async function runAiMatching() {
    if (!quotationId) return
    setBusy(true)
    try {
      const assistantResponse = payload(await invokeClientCommand('assistant.chat.send_message', {
        text: buildAiReviewPrompt(quotationId),
        clientMessageId: `xpert-quotation:ai-review:${quotationId}:${Date.now()}`,
        state: { source: '@xpert-ai/plugin-xpert-quotation', action: 'review_knowledge_price_matches', quotationId }
      }))
      if (assistantResponse?.success === false) throw new Error(resolveText(assistantResponse.message, context.locale) || t('aiReviewFailed'))
      notify('success', t('aiReviewStarted'))
    } catch (error) {
      notify('error', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveWorkbook() {
    if (!quotationId || !editorRef.current) return
    await runAction('save_workbook_snapshot', { quotationId, snapshot: editorRef.current.getSnapshot(), changeSummary: '保存报价工作台中的人工编辑。' })
  }

  function renderLine(line: Line, reviewed: boolean) {
    const completeLineReview = async (actionKey: string, input: Record<string, unknown>) => {
      const success = await runAction(actionKey, input)
      if (success) setActiveTab('approved')
    }
    return <ReviewItem
      key={line.id}
      line={line}
      busy={busy || dirty}
      t={t}
      onAcceptAi={() => void completeLineReview('accept_ai_recommendation', { quotationId, lineId: line.id, userConfirmed: true })}
      onManual={(unitPrice) => void completeLineReview('set_manual_price', { quotationId, lineId: line.id, unitPrice })}
      onSkip={() => void completeLineReview('skip_line', { quotationId, lineId: line.id })}
      onReopen={() => void runAction('reopen_line', { quotationId, lineId: line.id })}
      onSearchQuota={() => void delegateQuotaSearch(line)}
      onChooseQuotaCandidate={(candidateId) => void chooseQuotaCandidate(line, candidateId)}
      onSearchResourcePrice={(resourceId) => void delegateResourcePriceSearch(line, [resourceId])}
      onSearchResourceConsumption={(resourceId) => {
        const resource = line.quotaPricingResources?.find((item) => item.id === resourceId)
        if (resource) void delegateQuotaSearch(line, resource)
      }}
      onSearchAllResourcePrices={() => void delegateResourcePriceSearch(line, (line.quotaPricingResources ?? []).map((item) => item.id))}
      onChooseResourcePrice={(resourceId, candidateId, priceItemId, label, sourceWorkdayHours) => {
        setQuotaWorkdayHours(sourceWorkdayHours != null ? String(sourceWorkdayHours) : '')
        setResourcePriceTarget({ lineId: line.id, resourceId, candidateId, priceItemId, label, sourceWorkdayHours })
      }}
      onCalculate={() => setCalculationTarget({ lineId: line.id, label: line.name })}
      onApplyLine={() => void applyLine(line)}
      reviewed={reviewed}
    />
  }

  const applyAll = () => void applyToExcel()

  return <TooltipProvider>
    <Tabs
      value={activeTab}
      orientation="vertical"
      onValueChange={selectTab}
      className="!grid h-screen min-h-[720px] grid-cols-[208px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-muted/30 text-foreground max-[1100px]:h-auto max-[1100px]:min-h-[980px] max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[auto_auto_minmax(0,1fr)] max-[1100px]:overflow-visible"
    >
      <WorkbenchHeader
        activeTab={activeTab}
        t={t}
        quotations={data.quotations}
        quotation={quotation}
        quotationId={quotationId}
        busy={busy}
        dirty={dirty}
        knowledgeLoading={knowledgeLoading}
        reviewCount={unresolvedLines.length}
        approvedCount={approvedLines.length}
        canApply={canApply}
        canUndo={data.undo.available}
        onSelectQuotation={(id) => { setDirty(false); void load(id) }}
        onDelete={() => quotation && setDeleteTarget({ id: quotation.id, label: quotation.title })}
        onUpload={(file) => void uploadFile(file)}
        onRecognize={() => void runAiMatching()}
        onSave={() => void saveWorkbook()}
        onExport={() => void runAction('export_xlsx', { quotationId })}
        onApply={applyAll}
        onUndo={() => void runAction('undo_last', {})}
        onRefresh={() => activeTab === 'knowledge' ? void loadKnowledge() : void load(quotationId)}
      />
      <QuotationPanel
        t={t}
        detail={detail}
        snapshotId={snapshotId}
        locale={context.locale}
        editorRef={editorRef}
        onDirty={() => setDirty(true)}
        onContextChange={() => setEditorContextVersion((value) => value + 1)}
      />
      <PendingReviewPanel
        t={t}
        quotation={quotation}
        knowledgeLines={knowledgeReviewLines}
        unmatchedLines={unmatchedReviewLines}
        busy={busy}
        dirty={dirty}
        knowledgeAiCount={knowledgeAiCount}
        webAiCount={webAiCount}
        canApply={canApply}
        onAcceptAllKnowledge={() => void runAction('accept_all_ai_knowledge_recommendations', { quotationId, userConfirmed: true })}
        onAcceptAllWeb={() => void runAction('accept_all_ai_web_recommendations', { quotationId, userConfirmed: true })}
        onApply={applyAll}
        renderLine={renderLine}
      />
      <ApprovedReviewPanel t={t} quotation={quotation} lines={approvedLines} renderLine={renderLine}/>
      <KnowledgePanel
        t={t}
        knowledge={knowledge}
        knowledgebaseId={knowledgebaseId}
        search={knowledgeSearch}
        query={knowledgeQuery}
        loading={knowledgeLoading}
        onSearchChange={setKnowledgeSearch}
        onKnowledgebaseChange={(id) => { setKnowledgebaseId(id); void loadKnowledge({ knowledgebaseId: id, search: knowledgeSearch.trim() }) }}
        onSearch={() => void loadKnowledge({ search: knowledgeSearch.trim() })}
      />
      <WorkbenchDialogs
        t={t}
        busy={busy}
        resourcePriceTarget={resourcePriceTarget}
        quotaWorkdayHours={quotaWorkdayHours}
        calculationTarget={calculationTarget}
        excelOverwriteTarget={excelOverwriteTarget}
        deleteTarget={deleteTarget}
        onQuotaWorkdayHoursChange={setQuotaWorkdayHours}
        onCloseResourcePrice={() => setResourcePriceTarget(null)}
        onConfirmResourcePrice={() => void confirmResourcePrice()}
        onCloseCalculation={() => setCalculationTarget(null)}
        onConfirmCalculation={() => void confirmCalculation()}
        onCloseExcelOverwrite={() => setExcelOverwriteTarget(null)}
        onConfirmExcelOverwrite={() => void confirmExcelOverwrite()}
        onCloseDelete={() => setDeleteTarget(null)}
        onConfirmDelete={() => void confirmDelete()}
      />
    </Tabs>
  </TooltipProvider>
}

function toExcelOverwriteTarget(data: ActionResultData | undefined, changeSummary: string, lineId?: string): ExcelOverwriteTarget | null {
  if (data?.status !== 'overwrite_required' || !Number.isInteger(data.expectedVersionNumber) || !Number.isInteger(data.occupiedCellCount)) return null
  const occupiedCells = (data.occupiedCells ?? []).flatMap((cell) =>
    typeof cell.sheetName === 'string' && typeof cell.address === 'string'
      ? [{ sheetName: cell.sheetName, address: cell.address }]
      : []
  )
  return {
    ...(lineId ? { lineId } : {}),
    changeSummary,
    expectedVersionNumber: data.expectedVersionNumber as number,
    occupiedCellCount: data.occupiedCellCount as number,
    occupiedCells,
    occupiedCellsTruncated: data.occupiedCellsTruncated === true
  }
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App/>)
