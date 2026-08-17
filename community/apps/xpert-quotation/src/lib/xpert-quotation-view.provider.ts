import { Inject, Injectable, Optional } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataSource, In } from 'typeorm'
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type I18nObject,
  type XpertExtensionViewManifest,
  type XpertRemoteComponentEntry,
  type XpertRemoteComponentViewSchema,
  type XpertResolvedViewHostContext,
  type XpertViewActionRequest,
  type XpertViewActionResult,
  type XpertViewDataResult,
  type XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  KnowledgebaseRuntimeCapability,
  type RuntimeCapabilityRegistry,
  ViewExtensionProvider,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  XpertViewFileActionFile,
  renderRemoteReactIframeHtml
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  XPERT_QUOTATION_FEATURE,
  XPERT_QUOTATION_ICON,
  XPERT_QUOTATION_PLUGIN_NAME,
  XPERT_QUOTATION_PROVIDER_KEY,
  XPERT_QUOTATION_REMOTE_ENTRY_KEY,
  XPERT_QUOTATION_REMOTE_COMPONENT_DIR,
  XPERT_QUOTATION_TOOL_NAMES,
  XPERT_QUOTATION_VIEW_KEY
} from './constants.js'
import { XpertQuotationService } from './xpert-quotation.service.js'
import { XpertQuotationKnowledgebaseAdapter } from './xpert-quotation-knowledgebase.adapter.js'
import { XpertQuotaKnowledgeService } from './knowledge-ingestion/xpert-quota-knowledge.service.js'
import { XpertQuotaKnowledgeSyncService } from './knowledge-ingestion/xpert-quota-knowledge-sync.service.js'
import { toKnowledgePriceCandidates } from './xpert-quotation-knowledge.js'
import type { XpertScope } from './types.js'

const moduleFile = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFile)
const requireFromHere = createRequire(moduleFile)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
type XpertWorkbenchViewData = XpertViewDataResult &
  Partial<Awaited<ReturnType<XpertQuotationService['getWorkbenchData']>>> &
  { syncJobs?: Awaited<ReturnType<XpertQuotaKnowledgeSyncService['listJobs']>> }

@Injectable()
@ViewExtensionProvider(XPERT_QUOTATION_PROVIDER_KEY)
export class XpertQuotationViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: XpertQuotationService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry,
    @Optional() private readonly quotaKnowledge?: XpertQuotaKnowledgeService,
    @Optional() private readonly quotaKnowledgeSync?: XpertQuotaKnowledgeSyncService,
    private readonly knowledgebaseAdapter: XpertQuotationKnowledgebaseAdapter = new XpertQuotationKnowledgebaseAdapter(),
    @Optional() private readonly dataSource?: DataSource
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent' || (slot !== AGENT_WORKBENCH_FIXED_SLOT && slot !== AGENT_WORKBENCH_MAIN_SLOT)) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [{
      key: XPERT_QUOTATION_VIEW_KEY,
      title: text('Xpert Quotation', 'Xpert报价'),
      description: text('Import Xpert Software XLS or XLSX files, review consumption breakdowns, retrieve resource prices from connected knowledgebases, and export a format-preserving quotation.', '导入 Xpert XLS/XLSX、复核消耗量拆分、从当前 Agent 连接的价格知识库检索人材机价格并导出保格式报价。'),
      icon: { type: 'svg', value: XPERT_QUOTATION_ICON, color: '#176b45', alt: 'Xpert Quotation' },
      hostType: 'agent',
      slot,
      order: 43,
      refreshable: true,
      activation: { requiredFeatures: [XPERT_QUOTATION_FEATURE] },
      ...(fixed ? { workbench: { fixed: true, menu: { enabled: true, label: text('Quotation', '报价'), order: 43, icon: { type: 'svg', value: XPERT_QUOTATION_ICON, alt: 'Xpert Quotation' } } } } : {}),
      source: { provider: XPERT_QUOTATION_PROVIDER_KEY, plugin: XPERT_QUOTATION_PLUGIN_NAME },
      view: {
        type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: XPERT_QUOTATION_REMOTE_ENTRY_KEY },
        dataSource: { mode: 'platform' }
      },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 20 }, cache: { enabled: false } },
      hostEvents: { subscriptions: [{ key: 'xpert-quotation-tool-completed', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: [...XPERT_QUOTATION_TOOL_NAMES] }, action: { type: 'refresh-and-forward', debounceMs: 500 } }] },
      clientCommands: [{
        key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        label: text('Run Qwen AI price review', '运行千问 AI 价格复核')
      }, {
        key: WORKBENCH_NAVIGATION_OPEN_COMMAND,
        label: text('Open platform knowledgebase', '打开平台知识库')
      }, {
        key: ASSISTANT_CONTEXT_SET_COMMAND,
        label: text('Set quotation Workbench context', '设置报价 Workbench 上下文')
      }],
      actions: [
        { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        { key: 'import_source_xlsx', label: text('Import quotation Excel (.xls/.xlsx)', '导入报价 Excel（.xls/.xlsx）'), icon: 'ri-file-excel-2-line', placement: 'toolbar', actionType: 'invoke', transport: 'file' },
        { key: 'import_quota_pdf', label: text('Import consumption PDF', '导入消耗量 PDF'), icon: 'ri-file-pdf-2-line', actionType: 'invoke', transport: 'file' },
        { key: 'retry_quota_ingestion', label: text('Retry consumption ingestion', '重试消耗量解析'), icon: 'ri-restart-line', actionType: 'invoke' },
        { key: 'cancel_quota_ingestion', label: text('Cancel consumption ingestion', '取消消耗量解析'), icon: 'ri-stop-circle-line', actionType: 'invoke' },
        { key: 'review_quota_item', label: text('Review consumption item', '复核消耗量子目'), icon: 'ri-check-double-line', actionType: 'invoke' },
        { key: 'publish_quota_version', label: text('Publish consumption version', '发布消耗量版本'), icon: 'ri-upload-cloud-2-line', actionType: 'invoke' },
        { key: 'sync_quota_knowledgebase', label: text('Sync consumption knowledgebase', '同步消耗量知识库'), icon: 'ri-database-2-line', actionType: 'invoke' },
        { key: 'retry_quota_knowledge_sync', label: text('Retry consumption knowledge sync', '重试消耗量知识同步'), icon: 'ri-restart-line', actionType: 'invoke' },
        { key: 'cancel_quota_knowledge_sync', label: text('Cancel consumption knowledge sync', '取消消耗量知识同步'), icon: 'ri-stop-circle-line', actionType: 'invoke' },
        { key: 'auto_match', label: text('AI recognize and match', 'AI 识别并匹配'), icon: 'ri-magic-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'accept_ai_recommendation', label: text('Apply AI recommendation', '应用 AI 推荐'), icon: 'ri-magic-line', actionType: 'invoke' },
        { key: 'accept_all_ai_knowledge_recommendations', label: text('Apply all knowledgebase AI recommendations', '应用全部知识库 AI 推荐'), icon: 'ri-magic-line', actionType: 'invoke' },
        { key: 'accept_all_ai_web_recommendations', label: text('Apply all web-price AI recommendations', '应用全部联网价格 AI 推荐'), icon: 'ri-global-line', actionType: 'invoke' },
        { key: 'review_quota_breakdown', label: text('Review consumption breakdown', '审核消耗量拆分'), icon: 'ri-check-double-line', actionType: 'invoke' },
        { key: 'search_quota_components', label: text('Search quota candidates', '检索定额候选'), icon: 'ri-search-line', actionType: 'invoke' },
        { key: 'select_quota_candidate', label: text('Choose quota candidate', '选择消耗量候选'), icon: 'ri-check-line', actionType: 'invoke' },
        { key: 'search_resource_prices', label: text('Search resource prices', '检索资源价格'), icon: 'ri-search-line', actionType: 'invoke' },
        { key: 'recommend_resource_price', label: text('Choose resource price', '选择资源价格'), icon: 'ri-price-tag-3-line', actionType: 'invoke' },
        { key: 'accept_resource_price', label: text('Accept resource price', '采用资源价格'), icon: 'ri-check-line', actionType: 'invoke' },
        { key: 'calculate_comprehensive_rate', label: text('Calculate comprehensive rate', '计算综合单价与合价'), icon: 'ri-calculator-line', actionType: 'invoke' },
        { key: 'set_manual_price', label: text('Use manual price', '填写人工单价'), icon: 'ri-edit-line', actionType: 'invoke' },
        { key: 'skip_line', label: text('Skip line', '跳过此项'), icon: 'ri-skip-forward-line', actionType: 'invoke' },
        { key: 'reopen_line', label: text('Reopen skipped line', '重新打开已跳过项'), icon: 'ri-arrow-go-back-line', actionType: 'invoke' },
        { key: 'save_workbook_snapshot', label: text('Save workbook edits', '保存工作簿编辑'), icon: 'ri-save-line', actionType: 'invoke' },
        { key: 'apply_patch', label: text('Apply to workbook', '写入工作簿'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'export_xlsx', label: text('Export XLSX', '导出 XLSX'), icon: 'ri-download-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'delete_quotation', label: text('Delete quotation', '删除报价文件'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
        { key: 'undo_last', label: text('Undo last operation', '撤回上一步'), icon: 'ri-arrow-go-back-line', placement: 'toolbar', actionType: 'invoke' }
      ]
    }]
  }

  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== XPERT_QUOTATION_VIEW_KEY || component.entry !== XPERT_QUOTATION_REMOTE_ENTRY_KEY) {
      return { html: '<!doctype html><html><body>Unsupported Xpert Quotation component.</body></html>', contentType: 'text/html; charset=utf-8' }
    }
    const componentDir = join(moduleDir, 'remote-components', XPERT_QUOTATION_REMOTE_COMPONENT_DIR)
    const [appScript, react, reactDom] = await Promise.all([
      readFile(join(componentDir, 'app.js'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    const cssPath = join(componentDir, 'app.css')
    return {
      html: renderRemoteReactIframeHtml({ title: 'Xpert Quotation', lang: 'zh-Hans', reactUmd: react, reactDomUmd: reactDom, appScript, appCss: existsSync(cssPath) ? await readFile(cssPath, 'utf8') : '' }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertWorkbenchViewData> {
    if (viewKey !== XPERT_QUOTATION_VIEW_KEY) return { quotations: [], undo: { available: false, action: null, createdAt: null }, detail: null }
    if (stringParameter(query.parameters, 'table') === 'knowledgeSearch') {
      return this.getKnowledgeViewData(context, query)
    }
    if (stringParameter(query.parameters, 'table') === 'quotaKnowledge') {
      const scope = scopeFromContext(context)
      const sourceVersionId = stringParameter(query.parameters, 'sourceVersionId')
      const [workspace, syncJobs] = await Promise.all([
        this.quotaKnowledgeService().getWorkspace(scope, {
        sourceVersionId: stringParameter(query.parameters, 'sourceVersionId'),
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        reviewStatus: stringParameter(query.parameters, 'reviewStatus'),
        readiness: stringParameter(query.parameters, 'readiness')
        }),
        this.quotaKnowledgeSyncService().listJobs(scope, sourceVersionId)
      ])
      return { ...workspace, syncJobs }
    }
    return this.service.getWorkbenchData(scopeFromContext(context), stringParameter(query.parameters, 'quotationId') ?? query.selectionId)
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    if (viewKey !== XPERT_QUOTATION_VIEW_KEY) return failure('Unsupported view')
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') return success('报价工作台已刷新')
      if (actionKey === 'retry_quota_ingestion') {
        const data = await this.quotaKnowledgeService().retry(scope, requiredInput(request, 'ingestionJobId'))
        return { ...success('消耗量解析任务已重新入队'), data }
      }
      if (actionKey === 'cancel_quota_ingestion') {
        const data = await this.quotaKnowledgeService().cancel(scope, requiredInput(request, 'ingestionJobId'))
        return { ...success('已请求取消消耗量解析任务'), data }
      }
      if (actionKey === 'review_quota_item') {
        requiredConfirmation(request)
        const data = await this.quotaKnowledgeService().reviewItem(scope, {
          quotaItemId: requiredInput(request, 'quotaItemId'),
          decision: requiredDecision(request),
          comment: stringInput(request.input, 'comment') ?? '在报价 Workbench 中完成消耗量数据复核。',
          expectedRevision: requiredNumberInput(request, 'expectedRevision')
        })
        return { ...success(data.reviewStatus === 'approved' ? '消耗量子目已批准' : '消耗量子目已拒绝'), data }
      }
      if (actionKey === 'publish_quota_version') {
        requiredConfirmation(request)
        const data = await this.quotaKnowledgeService().publishVersion(scope, requiredInput(request, 'sourceVersionId'))
        return { ...success('消耗量资料版本已发布并设为当前版本'), data }
      }
      if (actionKey === 'sync_quota_knowledgebase') {
        requiredConfirmation(request)
        const knowledgebaseId = requiredInput(request, 'knowledgebaseId')
        if (!connectedKnowledgebaseIds(context).includes(knowledgebaseId)) throw new Error('只能同步到当前 Agent 已连接的知识库。')
        const data = await this.quotaKnowledgeSyncService().start(scope, {
          sourceVersionId: requiredInput(request, 'sourceVersionId'),
          knowledgebaseId,
          xpertId: context.hostId,
          agentKey: agentKeyFromContext(context)
        })
        return { ...success(data.duplicate ? '该知识库同步任务已在运行' : '消耗量知识库同步已进入后台队列'), data }
      }
      if (actionKey === 'retry_quota_knowledge_sync') {
        const data = await this.quotaKnowledgeSyncService().retry(scope, {
          syncJobId: requiredInput(request, 'syncJobId'),
          xpertId: context.hostId,
          agentKey: agentKeyFromContext(context)
        })
        return { ...success('消耗量知识库同步已重新入队'), data }
      }
      if (actionKey === 'cancel_quota_knowledge_sync') {
        const data = await this.quotaKnowledgeSyncService().cancel(scope, requiredInput(request, 'syncJobId'))
        return { ...success('已请求取消消耗量知识库同步'), data }
      }
      if (actionKey === 'auto_match') {
        const data = await this.service.inspectWorkbook(scope, requiredInput(request, 'quotationId'))
        return { ...success('工作簿结构已读取，请由千问继续识别并生成映射'), data }
      }
      if (actionKey === 'accept_ai_recommendation') {
        requiredConfirmation(request)
        const data = await this.service.acceptAiRecommendation(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'))
        return { ...success('AI 推荐已应用到审核选择，尚未写入 Excel'), data }
      }
      if (actionKey === 'accept_all_ai_knowledge_recommendations') {
        requiredConfirmation(request)
        const data = await this.service.acceptAiRecommendations(scope, requiredInput(request, 'quotationId'), 'knowledge')
        return { ...success(`已确认 ${data.acceptedCount} 项知识库 AI 推荐，尚未写入 Excel`), data }
      }
      if (actionKey === 'accept_all_ai_web_recommendations') {
        requiredConfirmation(request)
        const data = await this.service.acceptAiRecommendations(scope, requiredInput(request, 'quotationId'), 'web')
        return { ...success(`已确认 ${data.acceptedCount} 项联网价格 AI 推荐，尚未写入 Excel`), data }
      }
      if (actionKey === 'review_quota_breakdown') {
        requiredConfirmation(request)
        const decision = requiredDecision(request)
        const data = await this.service.reviewQuotaBreakdown(
          scope,
          requiredInput(request, 'quotationId'),
          requiredInput(request, 'lineId'),
          decision,
          stringInput(request.input, 'comment') ?? (decision === 'approve' ? '在报价 Workbench 中批准消耗量组成。' : '在报价 Workbench 中拒绝消耗量组成。')
        )
        return {
          ...success(decision === 'approve' ? '消耗量组成已批准' : '消耗量组成已拒绝；请重新检索并生成提案'),
          data
        }
      }
      if (actionKey === 'select_quota_candidate') {
        requiredConfirmation(request)
        const data = await this.service.selectQuotaCandidate(
          scope,
          requiredInput(request, 'quotationId'),
          requiredInput(request, 'lineId'),
          requiredInput(request, 'candidateId')
        )
        return { ...success('消耗量候选已选择，旧的人机材价格需要重新审核'), data }
      }
      if (actionKey === 'search_resource_prices') {
        // The quotation Workbench is hosted by the coordinator Agent. In the
        // supported multi-agent layout the price knowledgebase is connected to
        // the price-retrieval child Agent instead, so this host action cannot
        // impersonate that child or guess its knowledgebase id. Return a
        // structured, actionable result; the remote view delegates the retry
        // through assistant.chat.send_message and the child Agent persists the
        // candidate snapshot in its own scope.
        const knowledgebase = this.capabilities?.get(KnowledgebaseRuntimeCapability)
        const connectedIds = connectedKnowledgebaseIds(context)
        if (!knowledgebase || connectedIds.length === 0) {
          return failure('宿主 Agent 未连接价格知识库。请由价格检索子 Agent 执行本行资源价格检索；审核页会在完成后刷新并展示最多 5 个候选。')
        }
        try {
          const data = await this.service.searchResourcePrices(
            scope,
            requiredInput(request, 'quotationId'),
            requiredInput(request, 'lineId'),
            requiredInput(request, 'resourceId'),
            connectedIds,
            knowledgebase,
            numberInput(request, 'topK') ?? 8
          )
          return { ...success('资源价格检索已完成'), data }
        } catch (error) {
          // A coordinator may be connected to the consumption KB while the
          // price KB belongs to the price child Agent. Surface a delegation
          // result instead of a misleading Workbench error.
          if (isPriceKnowledgebaseUnavailable(error)) {
            return failure('宿主 Agent 未连接可用价格知识库。请由价格检索子 Agent 执行本行资源价格检索；审核页会在完成后刷新并展示最多 5 个候选。')
          }
          throw error
        }
      }
      if (actionKey === 'search_quota_components') {
        // Direct-material bill rows can be normalized without a runtime
        // capability; construction rows will receive the explicit adapter
        // error if the current host has no connected consumption database.
        const knowledgebase = this.capabilities?.get(KnowledgebaseRuntimeCapability)
        const data = await this.service.searchQuotaComponents(
          scope,
          requiredInput(request, 'quotationId'),
          requiredInput(request, 'lineId'),
          connectedKnowledgebaseIds(context),
          knowledgebase,
          numberInput(request, 'topK') ?? 5
        )
        return { ...success('定额候选检索已完成'), data }
      }
      if (actionKey === 'recommend_resource_price') {
        requiredConfirmation(request)
        const data = await this.service.recommendResourcePrice(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'), {
          resourceId: requiredInput(request, 'resourceId'),
          candidateId: requiredInput(request, 'candidateId'),
          priceItemId: requiredInput(request, 'priceItemId'),
          quotaWorkdayHours: numberInput(request, 'quotaWorkdayHours'),
          confidence: numberInput(request, 'confidence') ?? 0.8,
          rationale: stringInput(request.input, 'rationale') ?? '在报价审核区选择了兼容的资源价格候选。',
          differences: stringArrayInput(request, 'differences')
        })
        return { ...success('资源价格推荐已保存，等待人工批准'), data }
      }
      if (actionKey === 'accept_resource_price') {
        requiredConfirmation(request)
        const data = await this.service.acceptResourcePrice(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'), {
          resourceId: requiredInput(request, 'resourceId'),
          candidateId: requiredInput(request, 'candidateId'),
          priceItemId: requiredInput(request, 'priceItemId'),
          quotaWorkdayHours: numberInput(request, 'quotaWorkdayHours'),
          confidence: numberInput(request, 'confidence') ?? 0.8,
          rationale: stringInput(request.input, 'rationale') ?? '用户在报价审核区选择了当前资源价格。',
          differences: stringArrayInput(request, 'differences'),
          comment: stringInput(request.input, 'comment') ?? '用户在报价审核区确认采用当前资源价格。'
        })
        return { ...success('资源价格已采用并批准'), data }
      }
      if (actionKey === 'calculate_comprehensive_rate') {
        requiredConfirmation(request)
        const data = await this.service.calculateComprehensiveRate(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'), {
          fees: [],
          unitPriceScale: numberInput(request, 'unitPriceScale') ?? 4
        })
        return { ...success('综合单价和合价已计算并保存，尚未写入 Excel'), data }
      }
      if (actionKey === 'set_manual_price') {
        const data = await this.service.setManualPrice(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'), requiredInput(request, 'unitPrice'))
        return { ...success('人工单价已采用'), data }
      }
      if (actionKey === 'skip_line') {
        const data = await this.service.skipLine(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'))
        return { ...success('该报价项已跳过，不会阻塞其他数据写入'), data }
      }
      if (actionKey === 'reopen_line') {
        const data = await this.service.reopenLine(scope, requiredInput(request, 'quotationId'), requiredInput(request, 'lineId'))
        return { ...success('已跳过的报价项已重新打开'), data }
      }
      if (actionKey === 'save_workbook_snapshot') {
        const data = await this.service.saveWorkbookSnapshot(
          scope,
          requiredInput(request, 'quotationId'),
          requiredUnknownInput(request, 'snapshot'),
          stringInput(request.input, 'changeSummary') ?? '保存报价工作台中的人工编辑。'
        )
        return { ...success('工作簿编辑已保存，请重新识别并匹配'), data }
      }
      if (actionKey === 'apply_patch') {
        requiredConfirmation(request)
        const data = await this.service.applyQuotation(
          scope,
          requiredInput(request, 'quotationId'),
          stringInput(request.input, 'changeSummary') ?? '应用已审核的Xpert报价价格。',
          stringInput(request.input, 'lineId'),
          {
            overwriteExisting: request.input?.overwriteExisting === true,
            expectedVersionNumber: numberInput(request, 'expectedVersionNumber')
          }
        )
        if (data.status === 'overwrite_required') {
          return { ...success('目标单元格已有数据，请确认是否覆盖'), data, refresh: false }
        }
        return { ...success('报价已保格式写入新的 Excel 版本'), data }
      }
      if (actionKey === 'export_xlsx') {
        const quotationId = requiredInput(request, 'quotationId')
        const detail = await this.service.getWorkbenchData(scope, quotationId)
        return { ...success('Excel 文件已准备'), data: detail.detail?.officeFile ?? null, refresh: false }
      }
      if (actionKey === 'delete_quotation') {
        requiredConfirmation(request)
        const data = await this.service.deleteQuotation(scope, requiredInput(request, 'quotationId'))
        return { ...success('报价文件已从工作台移除，可使用撤回恢复'), data }
      }
      if (actionKey === 'undo_last') {
        const data = await this.service.undoLast(scope)
        return { ...success('已撤回上一步操作'), data }
      }
      return failure('不支持的操作')
    } catch (error) {
      return failure(error instanceof Error ? error.message : '报价操作失败')
    }
  }

  async executeViewFileAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest, file: XpertViewFileActionFile): Promise<XpertViewActionResult> {
    if (viewKey !== XPERT_QUOTATION_VIEW_KEY || !['import_source_xlsx', 'import_quota_pdf'].includes(actionKey)) return failure('不支持的文件操作')
    try {
      if (actionKey === 'import_quota_pdf') {
        const data = await this.quotaKnowledgeService().importPdf(scopeFromContext(context), {
          fileName: stringInput(request.input, 'name') ?? file.originalname ?? 'quota-source.pdf',
          mimeType: file.mimetype,
          buffer: file.buffer,
          sourceKey: stringInput(request.input, 'sourceKey'),
          displayName: stringInput(request.input, 'displayName')
        })
        return { ...success(data.duplicate ? '该 PDF 已存在，已返回现有导入任务' : '消耗量 PDF 已保存并进入后台解析队列'), data }
      }
      const input = { fileName: stringInput(request.input, 'name') ?? file.originalname ?? 'uploaded.xlsx', mimeType: file.mimetype, buffer: file.buffer }
      const data = await this.service.importSourceXlsx(scopeFromContext(context), input)
      return { ...success('Xpert报价表已导入'), data }
    } catch (error) {
      return failure(error instanceof Error ? error.message : '文件导入失败')
    }
  }

  private async getKnowledgeViewData(context: XpertResolvedViewHostContext, query: XpertViewQuery): Promise<XpertViewDataResult> {
    const agentConnectedIds = connectedKnowledgebaseIds(context)
    const api = this.capabilities?.get(KnowledgebaseRuntimeCapability)
    const listed = api
      ? await api.list({ workspaceId: context.workspaceId ?? undefined, published: true, limit: 100 }).catch(() => [])
      : []
    const childAgentKnowledgebaseIds = await this.getChildAgentKnowledgebaseIds(context)
    const persistedKnowledgebaseIds = await this.getPersistedKnowledgebaseIds(context, query)
    // The workbench is hosted by the coordinator Agent, while quotation
    // retrieval knowledgebases are intentionally attached to child Agents.
    // When the host has no direct connections, use the published workspace
    // catalog or IDs persisted in the current quotation for this page only;
    // Agent middleware keeps its own scoped IDs.
    const pageKnowledgebaseIds = [...new Set([
      ...agentConnectedIds,
      ...childAgentKnowledgebaseIds,
      ...(agentConnectedIds.length || childAgentKnowledgebaseIds.length || persistedKnowledgebaseIds.length
        ? persistedKnowledgebaseIds
        : listed.map((item) => item.id).filter(Boolean))
    ])]
    const metadataListed = await this.listKnowledgebaseMetadata(
      context,
      pageKnowledgebaseIds.filter((id) => !listed.some((item) => item.id === id))
    )
    const connectedListed = [...listed, ...metadataListed].filter((item) => pageKnowledgebaseIds.includes(item.id))
    const missingIds = pageKnowledgebaseIds.filter((id) => !connectedListed.some((item) => item.id === id))
    const fallbackListed = api && missingIds.length
      ? await api.list({ workspaceId: context.workspaceId ?? undefined, limit: 100 }).catch(() => [])
      : []
    const byId = new Map([...connectedListed, ...fallbackListed.filter((item) => pageKnowledgebaseIds.includes(item.id))].map((item) => [item.id, item]))
    const knowledgebases = pageKnowledgebaseIds.map((id) => byId.get(id) ?? { id, name: '未命名知识库' })
    const requestedId = stringParameter(query.parameters, 'knowledgebaseId')
    const search = query.search?.trim().slice(0, 500) ?? ''
    const activeKnowledgebaseId = requestedId && pageKnowledgebaseIds.includes(requestedId)
      ? requestedId
      : pageKnowledgebaseIds[0] ?? null
    if (requestedId && !pageKnowledgebaseIds.includes(requestedId)) {
      return {
        items: [],
        total: 0,
        summary: {
          knowledgebases,
          activeKnowledgebaseId,
          available: Boolean(api),
          queryRequired: !search,
          errorCode: 'knowledgebase_not_connected',
          resultMode: 'semantic_top_k'
        }
      }
    }
    const selectedIds = requestedId ? [requestedId] : pageKnowledgebaseIds
    const pageSize = Math.max(1, Math.min(20, Math.floor(query.pageSize ?? 20)))
    if (!api || !selectedIds.length || !search) {
      return {
        items: [],
        total: 0,
        summary: {
          knowledgebases,
          activeKnowledgebaseId,
          available: Boolean(api),
          queryRequired: !search,
          resultMode: 'semantic_top_k',
          ...(!api ? { errorCode: 'knowledgebase_runtime_unavailable' } : {}),
          ...(api && !selectedIds.length ? { errorCode: 'knowledgebase_not_connected' } : {})
        }
      }
    }
    let retrieval
    try {
      retrieval = await this.knowledgebaseAdapter.searchConnected({
        scope: scopeFromContext(context),
        knowledgebase: api,
        knowledgebaseIds: selectedIds,
        query: search,
        topK: pageSize,
        source: 'xpert-quotation-workbench',
        requestId: `workbench-${Date.now()}`
      })
    } catch {
      return {
        items: [],
        total: 0,
        summary: {
          knowledgebases,
          activeKnowledgebaseId,
          available: true,
          queryRequired: false,
          errorCode: 'knowledgebase_search_failed',
          resultMode: 'semantic_top_k',
          query: search,
          page: 1,
          pageSize,
          hasMore: false
        }
      }
    }
    const items = toKnowledgePriceCandidates(retrieval.documents, retrieval.knowledgebaseIds, search).slice(0, pageSize)
    return {
      items,
      total: items.length,
      summary: {
        knowledgebases,
        activeKnowledgebaseId,
        available: true,
        queryRequired: false,
        resultMode: 'semantic_top_k',
        query: search,
        page: 1,
        pageSize,
        hasMore: false,
        failedKnowledgebaseIds: retrieval.failedKnowledgebaseIds
      }
    }
  }

  private quotaKnowledgeService() {
    if (!this.quotaKnowledge) throw new Error('消耗量数据库服务不可用。')
    return this.quotaKnowledge
  }

  private quotaKnowledgeSyncService() {
    if (!this.quotaKnowledgeSync) throw new Error('消耗量知识库同步服务不可用。')
    return this.quotaKnowledgeSync
  }

  private async getPersistedKnowledgebaseIds(context: XpertResolvedViewHostContext, query: XpertViewQuery) {
    if (typeof this.service?.getWorkbenchData !== 'function') return []
    const workbench = await this.service.getWorkbenchData(
      scopeFromContext(context),
      stringParameter(query.parameters, 'quotationId') ?? query.selectionId
    ).catch(() => null)
    return persistedKnowledgebaseIds(workbench)
  }

  private async getChildAgentKnowledgebaseIds(context: XpertResolvedViewHostContext) {
    if (!this.dataSource?.isInitialized) return []
    try {
      const repository = this.dataSource.getRepository('xpert_agent')
      const rows = await repository.find({
        select: ['knowledgebaseIds'] as never,
        where: { teamId: context.hostId, tenantId: context.tenantId } as never
      }) as Array<{ knowledgebaseIds?: unknown }>
      return [...new Set(rows.flatMap((row) => idsFromKnowledgebaseArray(row.knowledgebaseIds)))]
    } catch {
      return []
    }
  }

  private async listKnowledgebaseMetadata(context: XpertResolvedViewHostContext, ids: string[]) {
    if (!this.dataSource?.isInitialized || !ids.length) return []
    try {
      const repository = this.dataSource.getRepository('knowledgebase')
      const rows = await repository.find({
        select: ['id', 'name', 'description'] as never,
        where: { id: In(ids), tenantId: context.tenantId } as never
      }) as Array<{ id: string; name?: string; description?: string | null }>
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null
      }))
    } catch {
      return []
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  return readFile(join(dirname(requireFromHere.resolve(`${packageName}/package.json`)), relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): XpertScope {
  return { tenantId: context.tenantId, organizationId: context.organizationId ?? null, workspaceId: context.workspaceId ?? null, userId: context.userId, assistantId: context.hostId }
}

function success(message: string): XpertViewActionResult { return { success: true, message: text(message, message), refresh: true } }
function failure(message: string): XpertViewActionResult { return { success: false, message: text(message, message) } }
function stringInput(input: XpertViewActionRequest['input'], key: string) { const value = input?.[key]; return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function requiredInput(request: XpertViewActionRequest, key: string) { const value = stringInput(request.input, key) ?? (key === 'quotationId' ? request.targetId?.trim() : undefined); if (!value) throw new Error(`${key} is required.`); return value }
function requiredDecision(request: XpertViewActionRequest): 'approve' | 'reject' { const value = stringInput(request.input, 'decision'); if (value !== 'approve' && value !== 'reject') throw new Error('decision must be approve or reject.'); return value }
function requiredUnknownInput(request: XpertViewActionRequest, key: string) { const value = request.input?.[key]; if (value === undefined || value === null) throw new Error(`${key} is required.`); return value }
function requiredNumberInput(request: XpertViewActionRequest, key: string) { const value = request.input?.[key]; if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${key} must be an integer.`); return value }
function numberInput(request: XpertViewActionRequest, key: string) { const value = request.input?.[key]; return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function booleanInput(request: XpertViewActionRequest, key: string) { const value = request.input?.[key]; if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean.`); return value }
function requiredFormulaStatus(request: XpertViewActionRequest): 'enabled' | 'skipped' { const value = stringInput(request.input, 'status'); if (value !== 'enabled' && value !== 'skipped') throw new Error('status must be enabled or skipped.'); return value }
function requiredFeeBase(request: XpertViewActionRequest): import('./types.js').PricingFeeBase { const value = stringInput(request.input, 'base'); if (!['direct_cost', 'labor_cost', 'material_cost', 'machine_cost', 'labor_plus_machine', 'running_total'].includes(value ?? '')) throw new Error('base is invalid.'); return value as import('./types.js').PricingFeeBase }
function requiredConfirmation(request: XpertViewActionRequest) { if (request.input?.userConfirmed !== true) throw new Error('Explicit user confirmation is required.') }
function stringArrayInput(request: XpertViewActionRequest, key: string) {
  const value = request.input?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 8) : []
}
function stringParameter(parameters: XpertViewQuery['parameters'], key: string) { const value = parameters?.[key]; return typeof value === 'string' && value.trim() ? value.trim() : undefined }

function connectedKnowledgebaseIds(context: Pick<XpertResolvedViewHostContext, 'hostState'>) {
  const hostState = context.hostState
  const agent = hostState && typeof hostState.agent === 'object' && hostState.agent !== null
    ? hostState.agent as Record<string, unknown>
    : null
  const connections = Array.isArray(agent?.connections) ? agent.connections : []
  return [...new Set(connections.flatMap((connection) => {
    if (!connection || typeof connection !== 'object') return []
    const item = connection as Record<string, unknown>
    return item.type === 'knowledgebase' && typeof item.id === 'string' && item.id.trim() ? [item.id.trim()] : []
  }))]
}

function persistedKnowledgebaseIds(workbench: unknown) {
  const detail = record(record(workbench).detail)
  const lines = Array.isArray(detail.lines) ? detail.lines : []
  const ids = lines.flatMap((line) => {
    const item = record(line)
    return [
      ...idsFromKnowledgebaseArray(item.knowledgeCandidates),
      ...idsFromKnowledgebaseArray(item.quotaCandidates),
      ...idsFromKnowledgebaseArray(record(item.quotaBreakdown).components),
      ...idsFromKnowledgebaseArray(item.aiRecommendedKnowledgebaseId)
    ]
  })
  return [...new Set(ids)]
}

function idsFromKnowledgebaseArray(value: unknown) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]
    const id = record(item).knowledgebaseId
    return typeof id === 'string' && id.trim() ? [id.trim()] : []
  })
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function isPriceKnowledgebaseUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /价格知识库|当前 Agent 没有可识别的价格|knowledgebase runtime capability|not connected to a knowledgebase/i.test(message)
}

function agentKeyFromContext(context: Pick<XpertResolvedViewHostContext, 'hostState'>) {
  const hostState = context.hostState
  const agent = hostState && typeof hostState.agent === 'object' && hostState.agent !== null
    ? hostState.agent as Record<string, unknown>
    : null
  const key = typeof agent?.key === 'string' ? agent.key.trim() : ''
  if (!key) throw new Error('当前 Agent key 不可用，无法写入知识库。')
  return key
}
