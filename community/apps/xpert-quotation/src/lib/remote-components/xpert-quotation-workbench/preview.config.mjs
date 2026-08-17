import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(componentRoot, '../../../../../../xpert')
const quotation = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Xpert综合楼报价',
  status: 'review_required',
  officeVersionNumber: 1,
  matchedCount: 3,
  reviewCount: 2,
  unmatchedCount: 2,
  totalAmount: null,
  warnings: ['材料暂估明细区为空']
}
const lines = [
  line(8, '010101001001', '平整场地', 'm2', '1250.4', '3.25', '4063.80', 'matched'),
  line(9, '010101003001', '挖沟槽土方', 'm3', '386.2', '28.60', '11045.32', 'matched'),
  {
    ...line(10, '010103001001', '回填方（机械夯填）', 'm3', '214.8', null, null, 'review_required', ['rate-a', 'rate-b']),
    specification: '室内机械回填；分层夯实；原土运输至回填点',
    quotaWorkScopes: ['室内机械回填', '分层夯实', '原土运输至回填点'],
    quotaSearchedAt: '2026-08-10T01:00:00.000Z',
    quotaBreakdown: {
      coverageStatus: 'partial', mappingStatus: 'proposed', automaticPricingAllowed: false,
      rationale: '机械回填和分层夯实可由当前定额候选覆盖，原土运输距离尚无可靠依据。',
      proposedAt: '2026-08-10T01:01:00.000Z',
      uncoveredWorkScopes: ['原土运输至回填点'],
      blockingReasons: ['pricing_not_evaluated', 'uncovered_work', 'unreviewed_quota_source'],
      components: [{
        candidateId: 'quota-preview-1', quotaCode: '1-115', quotaName: '机械填土 夯实', quotaUnit: 'm3',
        coveredWorkScopes: ['室内机械回填', '分层夯实'], confidence: 0.91,
        rationale: '工作内容和计量单位一致。', differences: ['运输距离未包含在当前候选内。'],
        knowledgebaseId: 'kb-quota-preview', documentId: 'doc-quota-2026', chunkId: 'chunk-1-115',
        sourcePages: [72], sourceReviewStatus: 'unreviewed', sourceIngestionReady: true,
        formulas: ['综合单价 = 人工费 + 材料费 + 机械费 + 管理费 + 利润'],
        resources: [
          { category: '人工', code: '00010001', name: '普工', unit: '工日', consumption: '0.170' },
          { category: '机械', code: '99031109', name: '电动夯实机 20-62kg·m', unit: '台班', consumption: '0.036' }
        ]
      }]
    },
    quotaPricingResources: [
      { id: 'resource-labor-preview', componentCandidateId: 'quota-preview-1', quotaCode: '1-115', quotaName: '机械填土 夯实', quotaUnit: 'm3', category: '人工', code: '00010001', name: '普工', aliases: ['普通工', '建筑普工', '综合工日'], unit: '工日', consumption: '0.170' },
      { id: 'resource-machine-preview', componentCandidateId: 'quota-preview-1', quotaCode: '1-115', quotaName: '机械填土 夯实', quotaUnit: 'm3', category: '机械', code: '99031109', name: '电动夯实机 20-62kg·m', aliases: ['电动夯土机', '夯实机'], unit: '台班', consumption: '0.036' }
    ],
    quotaResourcePrices: [
      {
        resourceId: 'resource-labor-preview', status: 'recommended', searchedAt: '2026-08-12T02:10:00.000Z', failedKnowledgebaseIds: [],
        candidates: [{
          id: 'resource-price-candidate-labor', knowledgebaseId: 'd243c77c-3338-4495-bcc0-521c9491b032', documentId: 'doc-wage-2026', chunkId: 'chunk-wage-1', documentName: '江苏省建设工程人工工资指导价.pdf', sourcePages: [12], score: 0.96, relevanceScore: 0.96, resourceMatchScore: 0.98,
          matchedPriceItemIds: ['price-item-labor'], priceItems: [{ id: 'price-item-labor', resourceCategory: '人工', code: '00010001', name: '建筑普工', aliases: ['普工', '普通工'], unit: '工日', unitPrice: '156.00', workdayHours: 8, region: '南京', pricePeriod: '2026-07', evidenceQuote: '南京地区建筑普工指导价 156.00 元/工日，工日按 8 小时计算。' }]
        }],
        recommendation: { candidateId: 'resource-price-candidate-labor', priceItemId: 'price-item-labor', matchedName: '建筑普工', sourceUnit: '工日', sourceUnitPrice: '156.00', normalizedUnitPrice: '156.00', sourceWorkdayHours: 8, quotaWorkdayHours: 8, workdayEvidenceQuote: '工日按 8 小时计算。', evidenceQuote: '南京地区建筑普工指导价 156.00 元/工日。', confidence: 0.96, rationale: '资源编码一致，普工与建筑普工属于已配置别名，工日口径一致。', differences: [], recommendedAt: '2026-08-12T02:10:30.000Z' }
      },
      {
        resourceId: 'resource-machine-preview', status: 'searched', searchedAt: '2026-08-12T02:11:00.000Z', failedKnowledgebaseIds: [],
        candidates: [{
          id: 'resource-price-candidate-machine', knowledgebaseId: 'd243c77c-3338-4495-bcc0-521c9491b032', documentId: 'doc-machine-2026', chunkId: 'chunk-machine-1', documentName: '江苏施工机械台班价格表.pdf', sourcePages: [41], score: 0.91, relevanceScore: 0.91, resourceMatchScore: 0.94,
          matchedPriceItemIds: ['price-item-machine'], priceItems: [{ id: 'price-item-machine', resourceCategory: '机械', code: '99031109', name: '电动夯实机 20-62kg·m', aliases: ['电动夯土机'], unit: '台班', unitPrice: '42.60', region: '江苏', pricePeriod: '2026-07', evidenceQuote: '电动夯实机 20-62kg·m，机械台班单价 42.60 元/台班。' }]
        }]
      }
    ],
    pricingCalculation: {
      engineVersion: 'quota-pricing-v1', directCosts: { labor: '26.52', material: '0.00', machine: '1.53', total: '28.05' },
      fees: [{ code: 'management', name: '管理费', ratePercent: '5.00', base: 'direct_cost', baseAmount: '28.05', amount: '1.40' }],
      comprehensiveUnitPrice: '30.91', totalAmount: '6639.47', calculatedAt: '2026-08-12T02:12:00.000Z'
    },
    aiRecommendedPriceItemId: 'rate-a',
    aiConfidence: 0.91,
    aiRationale: '报价行名称明确包含“机械夯填”，与候选 A 的施工方式一致；编码和单位也完全一致。',
    aiDifferences: ['候选 B 为人工夯填，与报价行施工方式不一致。'],
    aiRecommendedAt: '2026-08-06T05:00:00.000Z'
  },
  {
    ...line(11, 'CL-001', '聚合物水泥防水涂料', 'kg', '860', null, null, 'unmatched'),
    sheetName: '7.2E.1 材料暂估单价及调整表', kind: 'material',
    aiRecommendedUnitPrice: '16.80', aiRecommendedSourceUnit: 'kg', aiConfidence: 0.84,
    aiRationale: '价格清单中没有同编码或标准键。结合南京地区近期公开采购与供应商含税报价，推荐采用中位附近价格。',
    aiSources: [
      { title: '南京市公共资源交易平台 · 防水材料采购公告', url: 'https://njggzy.nanjing.gov.cn/', quote: '聚合物水泥防水涂料参考单价 16.50 元/kg，报价含税。', publishedAt: '2026-07-18' },
      { title: '江苏工程材料供应商公开报价', url: 'https://www.chinabidding.cn/', quote: 'JS 聚合物水泥防水涂料 17.10 元/kg，南京地区送货价。', publishedAt: '2026-07-26' }
    ],
    aiRecommendedAt: '2026-08-06T05:02:00.000Z'
  },
  {
    ...line(13, '010103001001', '室内机械回填方', 'm3', '42.5', null, null, 'review_required', ['rate-a', 'rate-b']),
    specification: '室内回填；分层夯实；机械作业',
    quotaWorkScopes: ['室内回填', '分层夯实', '机械作业'],
    quotaSearchedAt: '2026-08-16T03:00:00.000Z',
    quotaCandidates: [{
      id: 'web-quota-preview', knowledgebaseId: 'web', documentId: 'https://example.com/engineering/backfill',
      documentName: '联网工程做法证据（预览）', quotaName: '室内机械回填工序拆解', quotaUnit: 'm3',
      extractionStatus: 'partial', workContents: ['室内回填、分层夯实和机械作业'], sourcePages: [],
      sourceKind: 'web',
      externalSources: [{
        title: '联网工程做法证据（预览）', url: 'https://example.com/engineering/backfill',
        quote: '室内回填工程应分层铺填并采用机械夯实；原文未提供可核验的人材机消耗量。'
      }],
      resources: [
        { category: '人工', code: 'WEB-1-1', name: '普工', unit: '工日', consumption: '0', consumptionPending: true },
        { category: '机械', code: 'WEB-1-2', name: '电动夯实机', unit: '台班', consumption: '0', consumptionPending: true }
      ]
    }],
    quotaBreakdown: {
      coverageStatus: 'complete', mappingStatus: 'proposed', automaticPricingAllowed: false,
      rationale: '预览无知识库联网降级：来源仅支持工序拆解，消耗量待人工补充。', proposedAt: '2026-08-16T03:00:00.000Z',
      uncoveredWorkScopes: [], blockingReasons: ['pricing_not_evaluated', 'web_source_requires_review', 'incomplete_quota_candidate'],
      components: [{
        candidateId: 'web-quota-preview', quotaName: '室内机械回填工序拆解', quotaUnit: 'm3',
        coveredWorkScopes: ['室内回填', '分层夯实', '机械作业'], confidence: 0.63,
        rationale: '网页工序描述与当前工程特征一致，消耗量尚无证据。', differences: ['消耗量待人工补充'],
        knowledgebaseId: 'web', sourcePages: [], sourceReviewStatus: 'web_evidence_unreviewed', sourceIngestionReady: false,
        sourceKind: 'web',
        externalSources: [{ title: '联网工程做法证据（预览）', url: 'https://example.com/engineering/backfill', quote: '室内回填工程应分层铺填并采用机械夯实；原文未提供可核验的人材机消耗量。' }],
        resources: [
          { category: '人工', code: 'WEB-1-1', name: '普工', unit: '工日', consumption: '0', consumptionPending: true },
          { category: '机械', code: 'WEB-1-2', name: '电动夯实机', unit: '台班', consumption: '0', consumptionPending: true }
        ]
      }]
    },
    quotaPricingResources: [
      { id: 'web-resource-labor-preview', componentCandidateId: 'web-quota-preview', quotaName: '室内机械回填工序拆解', quotaUnit: 'm3', category: '人工', code: 'WEB-1-1', name: '普工', aliases: ['建筑普工'], unit: '工日', consumption: '0', consumptionPending: true },
      { id: 'web-resource-machine-preview', componentCandidateId: 'web-quota-preview', quotaName: '室内机械回填工序拆解', quotaUnit: 'm3', category: '机械', code: 'WEB-1-2', name: '电动夯实机', aliases: [], unit: '台班', consumption: '0', consumptionPending: true }
    ],
    quotaResourcePrices: [],
    aiRecommendedPriceItemId: 'rate-a', aiConfidence: 0.88,
    aiRationale: '名称、机械施工方式、编码和单位均与候选 A 一致。',
    aiDifferences: ['候选 B 的人工施工方式不符。'], aiRecommendedAt: '2026-08-06T05:03:00.000Z'
  },
  {
    ...line(14, 'CL-002', '挤塑聚苯板', 'm2', '320', null, null, 'unmatched'),
    sheetName: '7.2E.1 材料暂估单价及调整表', kind: 'material',
    aiRecommendedUnitPrice: '38.50', aiRecommendedSourceUnit: 'm2', aiConfidence: 0.81,
    aiRationale: '南京地区近期公开采购价格，规格与计价单位一致。',
    aiSources: [{ title: '江苏建筑材料公开价格', url: 'https://www.chinabidding.cn/', quote: '挤塑聚苯板参考单价 38.50 元/m2。', publishedAt: '2026-07-29' }],
    aiRecommendedAt: '2026-08-06T05:04:00.000Z'
  },
  { ...line(12, '010502001001', '矩形柱', 'm3', '68.4', '612.00', '41860.80', 'matched'), discipline: 'installation', sheetName: '4.2E.2.1 分部分项工程项目清单计价表' }
]
const knowledgebases = [{ id: 'd243c77c-3338-4495-bcc0-521c9491b032', name: '南京价格', documentNum: 1, chunkNum: 161 }]
const knowledgeItems = [{
  id: 'kb-preview-1', knowledgebaseId: knowledgebases[0].id, documentId: 'doc-official-price', chunkId: 'chunk-3', documentName: '官网价格.pdf',
  pageContent: '内墙乳胶漆 净味型 18L/桶 kg 税前综合价 16.80 元/kg。', score: 0.94, query: '内墙乳胶漆 净味型 18L/桶 kg', retrievedAt: '2026-08-07T00:00:00.000Z'
}]
const quotaVersion = {
  id: '50000000-0000-4000-8000-000000000001', sourceId: '51000000-0000-4000-8000-000000000001', versionNumber: 1,
  originalFileName: '1．江苏省建筑与装饰工程消耗量.pdf', status: 'active', size: 13282233, pageCount: 815,
  quotaItemCount: 3115, resourceCount: 10393, warningCount: 177, readyCount: 2998, reviewRequiredCount: 117,
  publishedAt: '2026-08-11T03:00:00.000Z'
}
const quotaJob = {
  id: '52000000-0000-4000-8000-000000000001', sourceVersionId: quotaVersion.id, status: 'ready_for_review', stage: 'ready_for_review',
  progress: 100, currentPage: 815, totalPages: 815, itemCount: 3115, resourceCount: 10393, warningCount: 177
}
const quotaSyncJob = {
  id: '54000000-0000-4000-8000-000000000001', sourceVersionId: quotaVersion.id, knowledgebaseId: knowledgebases[0].id,
  status: 'completed', stage: 'completed', progress: 100, total: 3115, processed: 3115, synced: 3115, skipped: 0, failed: 0
}
const quotaItems = [{
  id: '53000000-0000-4000-8000-000000000001', sourceVersionId: quotaVersion.id, quotaCode: '15-161', quotaName: '内墙面乳胶漆 二遍', quotaUnit: '10m2',
  chapter: '第十五章 油漆、涂料、裱糊工程', workContents: ['基层清理、涂刷乳胶漆二遍。'], adjustments: [], reviewStatus: 'approved', ingestionReady: true, revision: 2,
  resources: [
    { category: '人工', code: '00010401', name: '油漆工', unit: '工日', consumption: '0.725' },
    { category: '材料', code: '11010304', name: '内墙乳胶漆', unit: 'kg', consumption: '2.884' },
    { category: '材料', code: '30010501', name: '其他材料费', unit: '%', consumption: '1.000' }
  ],
  evidence: { pdfPages: [617], printedPages: ['装609'], excerpt: '工作内容：基层清理、涂刷乳胶漆二遍。\n编号 15-161\n内墙面乳胶漆 二遍\n11010304 内墙乳胶漆 kg 2.884' }
}, {
  id: '53000000-0000-4000-8000-000000000002', sourceVersionId: quotaVersion.id, quotaCode: '13-47', quotaName: '混凝土界面处理 刷界面剂', quotaUnit: '10m2',
  chapter: '第十三章 墙柱面装饰与隔断幕墙工程', workContents: ['清理基层、调制并涂刷界面剂。'], adjustments: [], reviewStatus: 'unreviewed', ingestionReady: true, revision: 1,
  resources: [
    { category: '人工', code: '00010401', name: '抹灰工', unit: '工日', consumption: '0.160' },
    { category: '材料', code: '12330300', name: '界面剂', unit: 'kg', consumption: '12.900' }
  ],
  evidence: { pdfPages: [492], printedPages: ['装484'], excerpt: '混凝土界面处理 刷界面剂\n12330300 界面剂 kg 12.900' }
}]

export default {
  title: 'Xpert报价 · Remote View Preview',
  frameTitle: 'Xpert报价工作台',
  workspaceRoot,
  instanceId: 'xpert-quotation-preview',
  component: { root: componentRoot, runtime: 'react', title: 'Xpert Quotation Preview' },
  hostContext: {
    manifest: { key: 'xpert_quotation' }, payload: {}, initialQuery: { parameters: {} }, locale: 'zh-Hans',
    theme: { mode: 'light', tokens: {
      colorBackground: 'oklch(0.98 0.004 145)', colorForeground: 'oklch(0.22 0.012 150)', colorCard: 'oklch(1 0 0)',
      colorCardForeground: 'oklch(0.22 0.012 150)', colorMuted: 'oklch(0.95 0.006 145)', colorMutedForeground: 'oklch(0.48 0.014 150)',
      colorBorder: 'oklch(0.89 0.009 145)', colorInput: 'oklch(0.89 0.009 145)', colorPrimary: 'oklch(0.45 0.12 155)',
      colorPrimaryForeground: 'oklch(0.99 0 0)', colorRing: 'oklch(0.62 0.1 155)', radiusMd: '0.375rem', radiusLg: '0.5rem'
    } }, debug: { enabled: false, production: true }
  },
  state: { actions: [], notifications: [], lines: structuredClone(lines), quotation: { ...quotation }, snapshotId: 'snapshot-preview-1', history: null, quotaItems: structuredClone(quotaItems), quotaVersion: { ...quotaVersion }, quotaJob: { ...quotaJob }, quotaSyncJob: { ...quotaSyncJob } },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const query = message.query ?? {}
      if (query.parameters?.table === 'knowledgeSearch') return { data: knowledgeSearch(query) }
      if (query.parameters?.table === 'quotaKnowledge') return { data: quotaKnowledgeSearch(query, state) }
      return { data: workbench(state) }
    }
    if (message.type === 'executeAction') {
      state.actions.push({ actionKey: message.actionKey, input: message.input })
      const line = state.lines.find((item) => item.id === message.input?.lineId)
      if (message.actionKey === 'undo_last' && state.history) {
        const previous = state.history
        state.quotation = previous.quotation
        state.lines = previous.lines
        state.snapshotId = previous.snapshotId
        state.history = null
        return previewSuccess('已撤回上一步操作')
      }
      if (message.actionKey !== 'export_xlsx') remember(state, message.actionKey)
      if (message.actionKey === 'set_manual_price' && line) {
        line.matchStatus = 'confirmed'; line.matchedUnitPrice = String(message.input?.unitPrice); line.calculatedAmount = amount(line.quantity, line.matchedUnitPrice); line.matchEvidence = '人工录入单价（未引用价格清单条目）'
      }
      if (message.actionKey === 'skip_line' && line) { line.matchStatus = 'ignored'; line.matchedUnitPrice = null; line.calculatedAmount = null; line.matchEvidence = '人工跳过' }
      if (message.actionKey === 'reopen_line' && line) { line.matchStatus = line.candidateIds?.length ? 'review_required' : 'unmatched'; line.matchEvidence = '已重新打开' }
      if (message.actionKey === 'review_quota_breakdown' && line?.quotaBreakdown?.mappingStatus === 'proposed') {
        line.quotaBreakdown.mappingStatus = message.input?.decision === 'approve' ? 'approved' : 'rejected'
        line.quotaBreakdown.reviewedAt = '2026-08-10T02:00:00.000Z'
        line.quotaBreakdown.reviewComment = String(message.input?.comment ?? '')
      }
      if (message.actionKey === 'accept_ai_recommendation' && line) {
        const item = workbench(state).detail?.candidates.find((candidate) => candidate.id === line.aiRecommendedPriceItemId)
        const unitPrice = item?.unitPrice ?? line.aiRecommendedUnitPrice
        if (unitPrice) {
          if (line.materialReferenceOnly) line.matchEvidence = '已确认材料参考推荐；不会写入分部分项综合单价。'
          else { line.matchStatus = 'confirmed'; line.matchedUnitPrice = unitPrice; line.calculatedAmount = amount(line.quantity, unitPrice); line.matchEvidence = item ? '一键应用 AI 知识库推荐' : '一键应用 AI 联网价格推荐' }
        }
      }
      if (message.actionKey === 'accept_all_ai_knowledge_recommendations') {
        state.lines.filter((item) => item.matchStatus === 'unmatched' && item.aiRecommendedKnowledgeCandidateId && item.aiRecommendedUnitPrice).forEach((item) => {
          if (item.materialReferenceOnly) { item.matchEvidence = '已确认材料参考推荐；不会写入分部分项综合单价。'; return }
          item.matchStatus = 'confirmed'; item.matchedUnitPrice = item.aiRecommendedUnitPrice; item.calculatedAmount = amount(item.quantity, item.aiRecommendedUnitPrice); item.matchEvidence = '一键应用 AI 知识库推荐'
        })
      }
      if (message.actionKey === 'accept_all_ai_web_recommendations') {
        state.lines.filter((item) => item.matchStatus === 'unmatched' && (item.kind === 'material' || item.materialReferenceOnly) && item.aiRecommendedUnitPrice && item.aiSources?.length).forEach((item) => {
          if (item.materialReferenceOnly) { item.matchEvidence = '已确认材料参考推荐；不会写入分部分项综合单价。'; return }
          item.matchStatus = 'confirmed'; item.matchedUnitPrice = item.aiRecommendedUnitPrice; item.calculatedAmount = amount(item.quantity, item.aiRecommendedUnitPrice); item.matchEvidence = '批量应用 AI 联网价格推荐'
        })
      }
      if (message.actionKey === 'apply_patch') {
        state.lines.forEach((item) => { if (item.matchStatus === 'matched' || item.matchStatus === 'confirmed') item.matchStatus = 'applied' })
      }
      if (message.actionKey === 'save_workbook_snapshot') state.snapshotId = `snapshot-preview-${state.actions.length + 1}`
      if (message.actionKey === 'delete_quotation') state.quotation = null
      if (message.actionKey === 'review_quota_item') {
        const item = state.quotaItems.find((candidate) => candidate.id === message.input?.quotaItemId)
        if (item) { item.reviewStatus = message.input?.decision === 'approve' ? 'approved' : 'rejected'; item.revision += 1 }
      }
      if (message.actionKey === 'publish_quota_version') state.quotaVersion.status = 'active'
      if (message.actionKey === 'sync_quota_knowledgebase' || message.actionKey === 'retry_quota_knowledge_sync') {
        state.quotaSyncJob = { ...quotaSyncJob, status: 'queued', stage: 'queued', progress: 0, processed: 0, synced: 0, skipped: 0, failed: 0 }
      }
      if (message.actionKey === 'cancel_quota_knowledge_sync') {
        state.quotaSyncJob.status = 'cancelled'; state.quotaSyncJob.stage = 'cancel_requested'
      }
      if (state.quotation) refreshQuotation(state)
      return previewSuccess('预览操作已完成', message.actionKey === 'export_xlsx' ? { fileName: 'Xpert综合楼报价.xlsx', fileUrl: '' } : {})
    }
    if (message.type === 'executeFileAction') {
      state.actions.push({ actionKey: message.actionKey, fileName: message.file?.name })
      return { result: { success: true, message: { zh_Hans: '预览文件已导入', en_US: 'Preview file imported' }, data: {} } }
    }
    if (message.type === 'invokeClientCommand') {
      state.actions.push({ commandKey: message.commandKey, payload: message.payload })
      if (message.commandKey === 'assistant.chat.send_message') return { result: { success: true, status: 'sent' } }
      if (message.commandKey === 'assistant.context.set') return { result: { success: true, status: 'updated' } }
    }
    throw new Error(`Unsupported Xpert Quotation preview request '${message.type}'.`)
  },
  async handleEvent(message, { state }) { if (message.type === 'notify') state.notifications.push({ level: message.level, message: message.message }); return {} }
}

function workbench(state) {
  return {
    quotations: state.quotation ? [state.quotation] : [],
    undo: { available: Boolean(state.history), action: state.history?.actionKey ?? null, createdAt: state.history?.createdAt ?? null },
    detail: state.quotation ? {
      quotation: state.quotation,
      lines: state.lines,
      candidates: [
        { id: 'rate-a', kind: 'project_rate', name: '回填方（机械夯填）', specification: '机械夯填', code: '010103001001', unit: 'm3', unitPrice: '42.80', sourceSheet: '项目综合价', sourceRow: 18 },
        { id: 'rate-b', kind: 'project_rate', name: '回填方（人工夯填）', specification: '人工夯填', code: '010103001001', unit: 'm3', unitPrice: '58.40', sourceSheet: '项目综合价', sourceRow: 19 }
      ],
      officeFile: { fileName: 'Xpert综合楼报价.xlsx', fileUrl: '', versionNumber: 1 },
      officeDocument: {
        item: { id: 'office-preview-1', title: 'Xpert综合楼报价', documentType: 'spreadsheet', currentVersionNumber: 1, currentFileVersionNumber: 1 },
        currentSnapshot: { id: state.snapshotId, snapshot: workbookSnapshot(state.lines) }
      }
    } : null
  }
}

function knowledgeSearch(message) {
  const query = String(message.search ?? '').trim()
  return {
    items: query ? knowledgeItems.filter((item) => item.pageContent.includes(query) || query.includes('乳胶漆')) : [],
    total: query ? 1 : 0,
    summary: {
      knowledgebases,
      activeKnowledgebaseId: knowledgebases[0].id,
      available: true,
      queryRequired: !query,
      resultMode: 'semantic_top_k',
      ...(query ? { query, page: 1, pageSize: 20, hasMore: false } : {})
    }
  }
}

function quotaKnowledgeSearch(message, state) {
  if (state.quotaSyncJob.status === 'queued') {
    state.quotaSyncJob.status = 'running'; state.quotaSyncJob.stage = 'writing_chunks'; state.quotaSyncJob.progress = 46; state.quotaSyncJob.processed = 1433; state.quotaSyncJob.synced = 1429; state.quotaSyncJob.failed = 4
  } else if (state.quotaSyncJob.status === 'running') {
    state.quotaSyncJob.status = 'completed_with_errors'; state.quotaSyncJob.stage = 'completed_with_errors'; state.quotaSyncJob.progress = 100; state.quotaSyncJob.processed = 3115; state.quotaSyncJob.synced = 3108; state.quotaSyncJob.failed = 7
  }
  const query = String(message.search ?? '').trim().toLowerCase()
  const reviewStatus = String(message.parameters?.reviewStatus ?? '')
  const readiness = String(message.parameters?.readiness ?? '')
  const page = Math.max(1, Number(message.page ?? 1))
  const pageSize = Math.max(1, Number(message.pageSize ?? 20))
  const filtered = state.quotaItems.filter((item) =>
    (!query || `${item.quotaCode} ${item.quotaName}`.toLowerCase().includes(query)) &&
    (!reviewStatus || item.reviewStatus === reviewStatus) &&
    (!readiness || (readiness === 'ready' ? item.ingestionReady : !item.ingestionReady))
  )
  return {
    sources: [{ id: state.quotaVersion.sourceId, displayName: '江苏省建筑与装饰工程消耗量', activeVersionId: state.quotaVersion.id }],
    versions: [state.quotaVersion],
    jobs: [state.quotaJob],
    syncJobs: [state.quotaSyncJob],
    selectedVersionId: state.quotaVersion.id,
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    hasMore: page * pageSize < filtered.length
  }
}

function remember(state, actionKey) {
  state.history = {
    actionKey,
    createdAt: new Date().toISOString(),
    quotation: structuredClone(state.quotation),
    lines: structuredClone(state.lines),
    snapshotId: state.snapshotId
  }
}

function previewSuccess(message, data = {}) {
  return { result: { success: true, refresh: true, message: { zh_Hans: message, en_US: message }, data } }
}

function refreshQuotation(state) {
  state.quotation.matchedCount = state.lines.filter((line) => ['matched', 'confirmed', 'applied'].includes(line.matchStatus)).length
  state.quotation.reviewCount = state.lines.filter((line) => line.matchStatus === 'review_required').length
  state.quotation.unmatchedCount = state.lines.filter((line) => line.matchStatus === 'unmatched').length
  const unresolved = state.quotation.reviewCount + state.quotation.unmatchedCount
  const pending = state.lines.some((line) => line.matchStatus === 'matched' || line.matchStatus === 'confirmed')
  state.quotation.status = unresolved ? 'review_required' : pending ? 'ready_to_apply' : 'applied'
}

function amount(quantity, unitPrice) { return (Number(quantity || 1) * Number(unitPrice || 0)).toFixed(2) }

function workbookSnapshot(currentLines) {
  const sheetId = 'sheet-xpert-bill'
  const cellData = {
    0: { 0: { v: '分部分项工程项目清单计价表' } },
    5: { 0: { v: '序号' }, 1: { v: '项目编码' }, 2: { v: '项目名称' }, 6: { v: '单位' }, 7: { v: '工程量' }, 8: { v: '综合单价' }, 9: { v: '合价' } }
  }
  for (const line of currentLines.filter((item) => item.sheetName.startsWith('3.2'))) {
    const row = line.rowNumber - 1
    cellData[row] = { 0: { v: line.rowNumber - 7 }, 1: { v: line.code }, 2: { v: line.name }, 6: { v: line.unit }, 7: { v: Number(line.quantity) } }
    if (line.matchStatus === 'applied') { cellData[row][8] = { v: Number(line.matchedUnitPrice) }; cellData[row][9] = { v: Number(line.calculatedAmount) } }
  }
  return {
    id: 'workbook-preview', name: 'Xpert综合楼报价', sheetOrder: [sheetId], styles: {}, resources: [],
    sheets: { [sheetId]: { id: sheetId, name: '3.2E.2.1 分部分项工程项目清单计价表', rowCount: 160, columnCount: 12, cellData, mergeData: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 9 }], rowData: {}, columnData: {}, defaultColumnWidth: 88, defaultRowHeight: 24, rowHeader: { width: 46 }, columnHeader: { height: 20 }, showGridlines: 1, freeze: {}, zoomRatio: 1, scrollTop: 0, scrollLeft: 0 } }
  }
}

function line(rowNumber, code, name, unit, quantity, matchedUnitPrice, calculatedAmount, matchStatus, candidateIds = []) {
  return {
    id: `30000000-0000-4000-8000-${String(rowNumber).padStart(12, '0')}`,
    sheetName: '3.2E.2.1 分部分项工程项目清单计价表', rowNumber, discipline: 'building', kind: 'bill', code, name, unit, quantity,
    matchedUnitPrice, calculatedAmount, matchStatus, candidateIds,
    matchEvidence: matchStatus === 'review_required' ? '存在多个同优先级价格，需人工或模型复核' : matchStatus === 'unmatched' ? '价格清单中没有相同编码或标准键' : '编码精确匹配'
  }
}
