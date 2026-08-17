import { createHash } from 'node:crypto'
import type { KnowledgebaseDocument } from '@xpert-ai/plugin-sdk'
import type { XpertQuotationLine } from './entities/xpert-quotation-line.entity.js'
import type {
  QuotaBreakdownComponent,
  QuotaBreakdownProposal,
  QuotaBreakdownProposalInput,
  QuotaKnowledgeCandidate,
  QuotaResourceConsumption
} from './types.js'
import { initializeQuotaPricingFormulaRules } from './xpert-quotation-resource-pricing.js'

const MAX_QUERY_LENGTH = 2_000
const MAX_CHUNK_LENGTH = 12_000
const MAX_WORK_SCOPES = 16
const QUOTA_CODE = /^\d{1,2}-\d{1,4}$/
const RESOURCE_CATEGORY = /^(?:人工|材料|机械|未分类)$/
const REPAIR_SCOPE = /拆除|铲除|拆换|修补|凿除|清除原有/
// A worksheet's `kind` is only a table-level hint. These two vocabularies
// provide a conservative row-level route for bill rows that are actually
// direct material purchases versus construction work.
const DIRECT_MATERIAL_TERMS = /采购|材料供应|购置|材料单价|材料暂估(?:价)?|材料费|纯材料|成品采购|供应价/
const CONSTRUCTION_ACTION_TERMS = /挖(?:土|方|槽|基坑)?|开挖|回填|填土|夯实|夯填|碾压|平整|运输|浇筑|安装|铺设|砌筑|拆除|施工|调试|焊接|制作|刷|涂刷|抹灰|绑扎|支模|搭设/

type FlattenedQuotaResource = QuotaResourceConsumption & { quotaCode?: string }
type FlattenedQuotaTable = {
  quotaCodes: string[]
  quotaName?: string
  quotaNames?: Record<string, string>
  quotaUnit?: string
  resources: FlattenedQuotaResource[]
  workContents: string[]
  adjustments: string[]
}

export function buildQuotaKnowledgeQuery(line: XpertQuotationLine) {
  const name = boundedText(line.name, 240) || '未提供'
  const specification = boundedText(line.specification, 1_200) || '未提供'
  const workScopes = extractQuotaWorkScopes(line.name, line.specification)
  // Keep retrieval text centered on the two facts that identify a quota table:
  // the bill item name and its complete project features. The returned chunk
  // is parsed for the quota number and 人材机 unit consumption columns.
  const lines = [
    `项目名称：${name}`,
    `项目特征规格：${specification}`,
    `检索关键词：${name} ${specification} 消耗量`,
    '知识类型：消耗量定额。查找对应消耗量表，返回定额编号、定额名称、定额单位，以及人工、材料、机械的编码、名称、单位和单位消耗量。'
  ]
  return {
    query: lines.join('\n').slice(0, MAX_QUERY_LENGTH),
    workScopes
  }
}

/**
 * Direct material rows are not quota work. Keep them in the same review model
 * but create a single material resource so the normal resource-price search
 * can show candidates and the pricing engine can calculate the material cost.
 */
export function buildDirectMaterialQuotaProposal(line: Pick<XpertQuotationLine, 'name' | 'specification' | 'unit' | 'code'>, proposedAt = new Date()): QuotaBreakdownProposal {
  const name = boundedText(line.name, 240) || '未命名材料'
  const specification = boundedText(line.specification, 600)
  const resource: QuotaResourceConsumption = {
    category: '材料',
    code: boundedText(line.code, 80) || 'DIRECT-MATERIAL',
    name: `${name}${specification ? ` ${specification}` : ''}`.slice(0, 240),
    unit: boundedText(line.unit, 40) || '未识别',
    consumption: '1'
  }
  const component: QuotaBreakdownComponent = {
    candidateId: `direct_material_${createHash('sha256').update([name, specification ?? '', resource.unit].join('\\u0000')).digest('hex').slice(0, 32)}`,
    coveredWorkScopes: [name],
    confidence: 0.96,
    rationale: '该清单行被识别为直接材料采购，不套用施工定额；按一个清单计量单位建立材料资源并进入资源价格审核。',
    differences: [],
    quotaName: name,
    quotaUnit: resource.unit,
    knowledgebaseId: 'direct-material',
    sourcePages: [],
    sourceReviewStatus: 'direct_material',
    sourceIngestionReady: true,
    directMaterial: true,
    resources: [resource]
  }
  return {
    coverageStatus: 'complete',
    mappingStatus: 'approved',
    components: [component],
    uncoveredWorkScopes: [],
    skippedUncoveredWorkScopes: [],
    blockingReasons: [],
    automaticPricingAllowed: false,
    rationale: '直接材料采购项已分流为材料资源价格检索。',
    proposedAt: proposedAt.toISOString()
  }
}

/**
 * Make the resource list visible as soon as a consumption search returns.
 * This is deliberately a proposed preview, not an approval: the line worker
 * can replace it with its audited 1:N proposal immediately afterwards. It is
 * used as a recovery path when a child Agent returns search evidence but does
 * not manage to issue the follow-up proposal call in the same turn.
 */
export function buildQuotaSearchPreview(
  lineDiscipline: 'building' | 'installation',
  workScopes: string[],
  candidates: QuotaKnowledgeCandidate[],
  proposedAt = new Date()
) {
  const currentScopes = uniqueStrings(workScopes.map((scope) => scope.trim()).filter(Boolean))
  const selected = [...candidates]
    .filter((candidate) => candidate.quotaCode)
    .sort((left, right) => quotaPreviewScore(right) - quotaPreviewScore(left) || left.id.localeCompare(right.id))[0]
  if (!selected || !currentScopes.length) return null
  try {
    return buildQuotaBreakdownProposal(
      lineDiscipline,
      currentScopes,
      candidates,
      {
        components: [{
          candidateId: selected.id,
          coveredWorkScopes: currentScopes,
          confidence: previewConfidence(selected),
          rationale: '消耗量检索已返回该候选的资源组成，系统先生成待审核预览；逐行 Worker 的正式提案可覆盖此预览。',
          differences: ['待审核预览，不代表 AI 推荐或人工批准。']
        }],
        uncoveredWorkScopes: [],
        rationale: '根据当前消耗量检索中资源信息最完整的候选生成待审核预览，等待逐行 Worker/人工确认。'
      },
      proposedAt
    )
  } catch {
    return null
  }
}

function quotaPreviewScore(candidate: QuotaKnowledgeCandidate) {
  const candidateResources = candidate.resources.length ? candidate.resources : fallbackQuotaResources(candidate.quotaCode, candidate.quotaName)
  const resources = candidateResources.length
  const concrete = candidateResources.filter((resource) => resource.consumptionPending !== true && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(resource.consumption.trim())).length
  const categories = new Set(candidateResources.map((resource) => resource.category)).size
  const structure = candidate.extractionStatus === 'structured' ? 300 : candidate.extractionStatus === 'partial' ? 200 : 100
  return structure + concrete * 50 + categories * 30 + resources * 3 + (candidate.relevanceScore ?? candidate.score ?? 0)
}

function previewConfidence(candidate: QuotaKnowledgeCandidate) {
  const retrieval = candidate.relevanceScore ?? candidate.score
  if (retrieval == null || !Number.isFinite(retrieval)) return 0.55
  return Math.max(0.35, Math.min(0.85, retrieval <= 1 ? retrieval : retrieval / 100))
}

export function isDirectMaterialLine(line: Pick<XpertQuotationLine, 'name' | 'specification' | 'kind' | 'materialReferenceOnly'>) {
  if (line.kind === 'material') return true
  if (line.kind !== 'bill') return false
  const text = `${line.name ?? ''}\n${line.specification ?? ''}`.trim()
  if (!text || !DIRECT_MATERIAL_TERMS.test(text)) return false
  // A construction action wins over a procurement word. For example,
  // "级配砂石回填，材料采购" is still a quota-priced construction item.
  return !CONSTRUCTION_ACTION_TERMS.test(text)
}

export function extractQuotaWorkScopes(name?: string | null, specification?: string | null) {
  const clauses = (specification ?? '')
    .replace(/\r/g, '\n')
    .split(/\n+|[；;]/)
    .map((value) => value.replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[.、)）]\s*/, '').trim())
    .filter((value) => value && !/^部位\s*[:：]/.test(value))
    .map((value) => value.slice(0, 240))
  const unique = uniqueStrings(clauses).slice(0, MAX_WORK_SCOPES)
  if (unique.length) return unique
  const fallback = boundedText(name, 240)
  return fallback ? [fallback] : []
}

export function toQuotaKnowledgeCandidates(
  documents: KnowledgebaseDocument[],
  allowedKnowledgebaseIds: string[],
  query: string,
  retrievedAt = new Date()
) {
  const allowed = new Set(allowedKnowledgebaseIds)
  const fallbackKnowledgebaseId = allowed.size === 1 ? allowedKnowledgebaseIds[0] : undefined
  const candidates = new Map<string, QuotaKnowledgeCandidate>()

  for (const document of documents) {
    const metadata = record(document.metadata)
    const knowledgebaseId = firstString(metadata, ['knowledgebaseId', 'knowledgeBaseId', 'kbId']) ?? fallbackKnowledgebaseId
    if (!knowledgebaseId || !allowed.has(knowledgebaseId)) continue
    const pageContent = normalizeChunkText(document.pageContent)
    if (!pageContent) continue
    const documentType = firstString(metadata, ['documentType', 'knowledgeType'])
    if (documentType && documentType !== 'quota_item') continue
    const parsed = parseQuotaChunk(pageContent)
    const metadataQuotaCode = normalizeQuotaCode(firstString(metadata, ['quotaCode']))
    const tableParts: FlattenedQuotaTable[] = parsed.tables?.length ? parsed.tables : [{
      quotaCodes: parsed.quotaCodes,
      quotaName: parsed.quotaName,
      quotaUnit: parsed.quotaUnit,
      resources: parsed.resources,
      workContents: parsed.workContents,
      adjustments: parsed.adjustments
    }]
    for (const table of tableParts) {
      const metadataCodeMatch = metadataQuotaCode && table.quotaCodes.find((code) => packedQuotaCodeMatches(metadataQuotaCode, code))
      const selectedCodes = metadataCodeMatch || metadataQuotaCode
        ? [metadataCodeMatch ?? metadataQuotaCode]
        : table.quotaCodes.length
          ? table.quotaCodes
          : [undefined]
      for (const quotaCode of selectedCodes) {
        const extractedQuotaCodes = uniqueStrings([
          ...(metadataQuotaCode ? [metadataQuotaCode] : []),
          ...table.quotaCodes
        ])
        const documentId = firstString(metadata, ['documentId', 'knowledgeDocumentId', 'knowledgeId'])
        const chunkId = firstString(metadata, ['chunkId']) ?? normalizeString(document.id)
        const documentName = firstString(metadata, ['documentName', 'originalFileName', 'filename', 'title', 'name'])
        const score = firstNumber(metadata, ['score'])
        const relevanceScore = firstNumber(metadata, ['relevanceScore'])
        const quotaName = firstString(metadata, ['quotaName']) ?? table.quotaNames?.[quotaCode] ?? table.quotaName
        const quotaUnit = firstString(metadata, ['quotaUnit']) ?? table.quotaUnit
        const discipline = firstString(metadata, ['discipline']) ?? inferDiscipline(`${documentName ?? ''}\n${pageContent}`)
        const region = firstString(metadata, ['region']) ?? inferRegion(`${documentName ?? ''}\n${pageContent}`)
        const edition = firstString(metadata, ['edition']) ?? inferEdition(`${documentName ?? ''}\n${pageContent}`)
        const tableResources = table.resources
          .filter((resource) => !resource.quotaCode || resource.quotaCode === quotaCode)
          .map(({ quotaCode: _resourceQuotaCode, ...resource }) => resource)
        const extractionStatus = quotaExtractionStatus({ quotaCode, quotaName, quotaUnit, parsed: { ...parsed, resources: tableResources } })
        const metadataIngestionReady = firstBoolean(metadata, ['ingestionReady'])
        const id = candidateId(knowledgebaseId, documentId, chunkId, `${quotaCode}\u0000${pageContent}`)
        const candidate: QuotaKnowledgeCandidate = {
          id,
          knowledgebaseId,
          ...(documentId ? { documentId } : {}),
          ...(chunkId ? { chunkId } : {}),
          ...(documentName ? { documentName } : {}),
          pageContent,
          ...(score !== undefined ? { score } : {}),
          ...(relevanceScore !== undefined ? { relevanceScore } : {}),
          ...(quotaCode ? { quotaCode } : {}),
          ...(quotaName ? { quotaName } : {}),
          ...(quotaUnit ? { quotaUnit } : {}),
          ...(region ? { region } : {}),
          ...(edition ? { edition } : {}),
          ...(discipline ? { discipline } : {}),
          extractionStatus,
          extractedQuotaCodes,
          reviewStatus: firstString(metadata, ['reviewStatus']) ?? parsed.reviewStatus ?? 'unknown',
          ingestionReady: metadataIngestionReady ?? extractionStatus === 'structured',
          workContents: table.workContents,
          resources: tableResources,
          adjustments: table.adjustments,
          ...(extractFormulaHints(table.adjustments).length ? { formulas: extractFormulaHints(table.adjustments) } : {}),
          ...(firstString(metadata, ['sourceFile', 'file']) ? { sourceFile: firstString(metadata, ['sourceFile', 'file']) } : {}),
          sourcePages: sourcePages(metadata, pageContent),
          query,
          retrievedAt: retrievedAt.toISOString()
        }
        const current = candidates.get(id)
        if (!current || candidateRank(candidate) > candidateRank(current)) candidates.set(id, candidate)
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => candidateRank(right) - candidateRank(left) || compareQuotaCodes(left.quotaCode, right.quotaCode) || left.id.localeCompare(right.id))
}

/** Rebuild resources for candidates persisted before flattened-OCR parsing was available. */
export function repairPersistedQuotaCandidate(candidate: QuotaKnowledgeCandidate): QuotaKnowledgeCandidate {
  // Newer ingestion writes a compact, line-oriented resource section. Repair
  // that form before falling back to OCR heuristics; otherwise a legacy
  // pending-resource snapshot can mask the real quantities forever.
  const parsed = parseQuotaChunk(candidate.pageContent)
  const parsedResources = parsed.resources
  const parsedCodeMatches = !parsed.quotaCodes.length || parsed.quotaCodes.some((code) => packedQuotaCodeMatches(candidate.quotaCode, code))
  // Prefer a newly parsed resource section over a legacy pending snapshot even
  // when one OCR cell is still missing. The pricing engine can safely use the
  // quantity fallback of one and the review page must still show every parsed
  // 人/材/机 row.
  if (parsedResources.length && parsedCodeMatches &&
    (hasConcreteQuotaResources(parsedResources) || parsedResources.length >= candidate.resources.length)) {
    const quotaCode = candidate.quotaCode ?? parsed.quotaCodes[0]
    const quotaName = candidate.quotaName ?? parsed.quotaName
    const quotaUnit = candidate.quotaUnit ?? parsed.quotaUnit
    const resources = supplementQuotaResources(parsedResources, quotaCode, quotaName)
    const extractionStatus = quotaExtractionStatus({ quotaCode, quotaName, quotaUnit, parsed: { ...parsed, resources } })
    const effectiveExtractionStatus = extractionStatus === 'structured' && !hasConcreteQuotaResources(resources) ? 'partial' : extractionStatus
    return {
      ...candidate,
      ...(quotaCode ? { quotaCode } : {}),
      ...(quotaName ? { quotaName } : {}),
      ...(quotaUnit ? { quotaUnit } : {}),
      extractedQuotaCodes: uniqueStrings([...(quotaCode ? [quotaCode] : []), ...parsed.quotaCodes, ...candidate.extractedQuotaCodes]),
      extractionStatus: effectiveExtractionStatus,
      ingestionReady: effectiveExtractionStatus === 'structured',
      workContents: parsed.workContents.length ? parsed.workContents : candidate.workContents,
      resources,
      adjustments: parsed.adjustments.length ? parsed.adjustments : candidate.adjustments,
      ...(extractFormulaHints(parsed.adjustments).length ? { formulas: extractFormulaHints(parsed.adjustments) } : {})
    }
  }
  const tables = parseFlattenedOcrQuotaTables(candidate.pageContent)
  if (!tables.length) return fallbackQuotaResourceCandidate(repairPersistedResourceRowsFallback(candidate))
  const match = tables
    .flatMap((table) => table.quotaCodes.map((quotaCode) => ({ table, quotaCode })))
    .find(({ quotaCode }) => packedQuotaCodeMatches(candidate.quotaCode, quotaCode))
  if (!match) return fallbackQuotaResourceCandidate(repairPersistedResourceRowsFallback(candidate))
  const tableResources = match.table.resources
    .filter((resource) => !resource.quotaCode || resource.quotaCode === match.quotaCode)
    .map(({ quotaCode: _resourceQuotaCode, ...resource }) => resource)
  if (!tableResources.length) {
    const repaired = repairPersistedResourceRowsFallback(candidate)
    if (hasConcreteQuotaResources(repaired.resources)) return repaired
    return fallbackQuotaResourceCandidate(repaired)
  }
  const quotaName = match.table.quotaNames?.[match.quotaCode] ?? candidate.quotaName
  const quotaUnit = candidate.quotaUnit ?? match.table.quotaUnit
  const resources = supplementQuotaResources(tableResources, match.quotaCode, quotaName)
  const extractionStatus = quotaExtractionStatus({
    quotaCode: match.quotaCode,
    quotaName,
    quotaUnit,
    parsed: { ...parseQuotaChunk(candidate.pageContent), resources }
  })
  const effectiveExtractionStatus = extractionStatus === 'structured' && !hasConcreteQuotaResources(resources) ? 'partial' : extractionStatus
  return {
    ...candidate,
    quotaCode: match.quotaCode,
    ...(quotaName ? { quotaName } : {}),
    ...(quotaUnit ? { quotaUnit } : {}),
    extractedQuotaCodes: uniqueStrings([match.quotaCode, ...candidate.extractedQuotaCodes]),
    extractionStatus: effectiveExtractionStatus,
    ingestionReady: effectiveExtractionStatus === 'structured',
    workContents: match.table.workContents.length ? match.table.workContents : candidate.workContents,
    resources,
    adjustments: match.table.adjustments.length ? match.table.adjustments : candidate.adjustments,
    ...(extractFormulaHints(match.table.adjustments).length ? { formulas: extractFormulaHints(match.table.adjustments) } : {})
  }
}

/**
 * Last-resort resource candidates for legacy chunks where the platform stored
 * only the quota identity and source excerpt. Names/codes are intentionally
 * conservative and quantities are marked pending; no consumption is invented.
 */
function fallbackQuotaResourceCandidate(candidate: QuotaKnowledgeCandidate): QuotaKnowledgeCandidate {
  if (!candidate.quotaCode) return candidate
  const resources = supplementQuotaResources(candidate.resources, candidate.quotaCode, candidate.quotaName)
  if (resources.length <= candidate.resources.length) return candidate
  return { ...candidate, resources, extractionStatus: 'partial', ingestionReady: false }
}

/** Add only known resource identities for a quota family. Missing quantities
 * stay pending and are handled by the calculator's default-of-one policy. */
function supplementQuotaResources(resources: QuotaResourceConsumption[], quotaCode?: string, quotaName?: string) {
  const existing = new Set(resources.map((resource) => [resource.category, resource.code, resource.unit].join('\u0000')))
  const supplemental = fallbackQuotaResources(quotaCode, quotaName).filter((resource) => {
    const key = [resource.category, resource.code, resource.unit].join('\u0000')
    return !existing.has(key)
  })
  return [...resources, ...supplemental]
}

/** A resource row is usable for deterministic pricing only when OCR/ingestion
 * supplied a real identity, unit and quantity. Pending rows are review hints,
 * not an input to the pricing engine. */
export function hasConcreteQuotaResources(resources: QuotaResourceConsumption[]) {
  return resources.length > 0 && resources.every((resource) =>
    resource.consumptionPending !== true &&
    Boolean(resource.code?.trim()) &&
    Boolean(resource.name?.trim()) &&
    Boolean(resource.unit?.trim()) &&
    resource.unit.trim() !== '未识别' &&
    /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(resource.consumption.trim())
  )
}

/**
 * Return conservative, searchable resource candidates for legacy OCR snapshots
 * that persisted a quota identity but no resource rows. Quantities are always
 * marked pending: these are review candidates, never invented consumption.
 */
export function fallbackQuotaResources(quotaCode?: string, quotaName?: string): QuotaResourceConsumption[] {
  if (!quotaCode) return []
  const [chapter, suffixText] = quotaCode.split('-')
  const suffix = Number(suffixText)
  if (chapter !== '1' || !Number.isFinite(suffix)) return []
  const pending = (category: QuotaResourceConsumption['category'], code: string, name: string, unit: string): QuotaResourceConsumption => ({
    category, code, name, unit, consumption: '0', consumptionPending: true
  })
  const resources: QuotaResourceConsumption[] = []
  if (suffix >= 73 && suffix <= 80) resources.push(pending('人工', '00150101', '普工', '工日'))
  if (suffix >= 121 && suffix <= 128) resources.push(
    pending('人工', '00150101', '普工', '工日'),
    pending('机械', '99010303', '履带式单斗挖掘机(液压) 斗容量0.6m3', '台班'),
    pending('机械', '99070106', '履带式推土机 功率75kW', '台班')
  )
  if (suffix >= 185 && suffix <= 188) resources.push(
    pending('人工', '00150101', '普工', '工日'),
    pending('机械', suffix === 185 ? '99130304' : suffix === 186 ? '99130306' : suffix === 187 ? '99130315' : '99130317', '钢轮振动压路机', '台班')
  )
  if (suffix >= 189 && suffix <= 192) resources.push(
    pending('人工', '00150101', '普工', '工日'),
    pending('材料', '31150101', '水', 'm3'),
    pending('机械', suffix === 191 ? '99130315' : '99070106', suffix === 191 ? '钢轮振动压路机 工作质量10t' : '履带式推土机 功率75kW', '台班')
  )
  if (suffix >= 45 && suffix <= 48) resources.push(
    pending('人工', '00150101', '普工', '工日'),
    ...(suffix === 46 || suffix === 47 || suffix === 48 ? [pending('材料', '04050207', '碎石 5-40mm', 't')] : []),
    ...(suffix === 45 || suffix === 46 ? [pending('材料', '04030100', '黄砂', 't')] : []),
    pending('材料', '31150101', '水', 'm3'),
    pending('机械', '99130511', '电动夯实机 夯击能量250N·m', '台班')
  )
  // Keep the helper useful for the common earthwork aliases even when a
  // future quota edition uses a different suffix for the same work.
  if (!resources.length && /挖土|挖方|土方/.test(quotaName ?? '')) resources.push(
    pending('人工', '00150101', '普工', '工日'),
    pending('机械', '99010303', '履带式单斗挖掘机', '台班')
  )
  return resources
}

/**
 * Older search snapshots kept only the metadata-selected code even when one
 * OCR chunk contained several quota tables. Re-expand those chunks so repair
 * can choose the actual subitem instead of reusing an unrelated first column.
 */
export function expandPersistedQuotaCandidates(candidates: QuotaKnowledgeCandidate[]) {
  const expanded = new Map<string, QuotaKnowledgeCandidate>()
  for (const persisted of candidates) {
    const repaired = repairPersistedQuotaCandidate(persisted)
    addExpandedCandidate(expanded, repaired)
    const tables = parseFlattenedOcrQuotaTables(persisted.pageContent)
    for (const table of tables) {
      for (const quotaCode of table.quotaCodes) {
        const resources = table.resources
          .filter((resource) => !resource.quotaCode || resource.quotaCode === quotaCode)
          .map(({ quotaCode: _resourceQuotaCode, ...resource }) => resource)
        if (!resources.length) continue
        const quotaName = meaningfulQuotaName(table.quotaNames?.[quotaCode]) ?? inferKnownOcrQuotaName(quotaCode, persisted.pageContent) ?? meaningfulQuotaName(table.quotaName) ?? persisted.quotaName
        const quotaUnit = table.quotaUnit ?? persisted.quotaUnit
        const extractionStatus = quotaExtractionStatus({
          quotaCode,
          quotaName,
          quotaUnit,
          parsed: { ...parseQuotaChunk(persisted.pageContent), resources }
        })
        const samePersistedCode = packedQuotaCodeMatches(persisted.quotaCode, quotaCode)
        const sibling: QuotaKnowledgeCandidate = {
          ...persisted,
          id: samePersistedCode ? persisted.id : persistedSiblingCandidateId(persisted.id, quotaCode),
          quotaCode,
          ...(quotaName ? { quotaName } : {}),
          ...(quotaUnit ? { quotaUnit } : {}),
          extractedQuotaCodes: uniqueStrings([...table.quotaCodes, ...persisted.extractedQuotaCodes]),
          extractionStatus,
          ingestionReady: extractionStatus === 'structured',
          workContents: table.workContents.length ? table.workContents : persisted.workContents,
          resources,
          adjustments: table.adjustments.length ? table.adjustments : persisted.adjustments,
          ...(extractFormulaHints(table.adjustments).length ? { formulas: extractFormulaHints(table.adjustments) } : {})
        }
        addExpandedCandidate(expanded, sibling)
      }
    }
  }
  return [...expanded.values()].sort((left, right) =>
    persistedCandidateQuality(right) - persistedCandidateQuality(left) ||
    compareQuotaCodes(left.quotaCode, right.quotaCode) ||
    left.id.localeCompare(right.id)
  ).slice(0, 80)
}

export function selectPersistedQuotaCandidate(
  line: Pick<XpertQuotationLine, 'name' | 'specification' | 'unit'>,
  current: QuotaBreakdownComponent,
  candidates: QuotaKnowledgeCandidate[]
) {
  const currentCandidate = candidates.find((candidate) => candidate.id === current.candidateId)
  const eligible = candidates.filter((candidate) => hasConcreteQuotaResources(candidate.resources) && candidate.quotaCode)
  if (!eligible.length) return currentCandidate
  const ranked = eligible
    .map((candidate) => ({ candidate, score: persistedCandidateMatchScore(line, current, candidate) }))
    .sort((left, right) => right.score - left.score || persistedCandidateQuality(right.candidate) - persistedCandidateQuality(left.candidate))
  const best = ranked[0]
  if (!currentCandidate || !hasConcreteQuotaResources(currentCandidate.resources)) return best.score >= 20 ? best.candidate : currentCandidate
  const currentScore = persistedCandidateMatchScore(line, current, currentCandidate)
  return best.candidate.id !== currentCandidate.id && best.score >= 45 && best.score >= currentScore + 25
    ? best.candidate
    : currentCandidate
}

function addExpandedCandidate(target: Map<string, QuotaKnowledgeCandidate>, candidate: QuotaKnowledgeCandidate) {
  const key = [candidate.knowledgebaseId, candidate.documentId ?? '', candidate.chunkId ?? '', candidate.quotaCode ?? candidate.id].join('\u0000')
  const current = target.get(key)
  if (!current || persistedCandidateQuality(candidate) > persistedCandidateQuality(current)) target.set(key, candidate)
}

function persistedCandidateQuality(candidate: QuotaKnowledgeCandidate) {
  return (candidate.extractionStatus === 'structured' ? 300 : candidate.extractionStatus === 'partial' ? 200 : 100) +
    Math.min(20, candidate.resources.length * 2) +
    (candidate.quotaName ? 8 : 0) +
    (candidate.quotaUnit ? 8 : 0) +
    (candidate.relevanceScore ?? candidate.score ?? 0)
}

function persistedCandidateMatchScore(
  line: Pick<XpertQuotationLine, 'name' | 'specification' | 'unit'>,
  component: QuotaBreakdownComponent,
  candidate: QuotaKnowledgeCandidate
) {
  const lineText = normalizeMatchText(`${line.name ?? ''} ${line.specification ?? ''}`)
  // Persisted OCR candidates often have a generic name (for example
  // `定额子目 1-46`) even though the source page contains the real item name.
  // Include the bounded source excerpt in matching so a repaired candidate can
  // still be selected deterministically after a previous weak extraction.
  const candidateText = normalizeMatchText(`${candidate.quotaName ?? ''} ${candidate.workContents.join(' ')} ${candidate.pageContent}`)
  const candidateIdentity = normalizeMatchText(`${candidate.quotaName ?? ''} ${candidate.workContents.join(' ')}`)
  let score = Math.min(12, candidate.resources.length * 2)
  if (line.unit && candidate.quotaUnit && normalizeQuotaUnitForMatch(line.unit) === normalizeQuotaUnitForMatch(candidate.quotaUnit)) score += 8
  if (/回填/.test(lineText)) score += /回填/.test(candidateText) ? 35 : -30
  if (/夯实|压实|夯填/.test(lineText)) score += /夯实|压实|夯填/.test(candidateText) ? 22 : -10
  if (/基坑/.test(lineText)) score += /槽坑|基坑/.test(candidateIdentity) ? 28 : /地面/.test(candidateIdentity) ? -8 : 0
  if (/房心/.test(lineText)) score += /地面/.test(candidateIdentity) ? 28 : /槽坑|基坑/.test(candidateIdentity) ? -12 : 0
  if (/级配砂石|砂石回填/.test(lineText)) score += /回填砂石/.test(candidateText) ? 45 : /回填砂(?!石)/.test(candidateText) ? -20 : 0
  if (/管沟|沟槽/.test(lineText)) score += /管沟|沟槽/.test(candidateText) ? 28 : 0
  if (/平整场地/.test(lineText)) score += /平整场地/.test(candidateText) ? 40 : -15
  if (/运输|弃置|运距/.test(candidateText) && !/运输|弃置|余方|运土/.test(lineText)) score -= 40
  if (candidate.quotaCode && quotaCodeIsMentioned(component.rationale, candidate.quotaCode)) score += 35
  return score
}

function quotaCodeIsMentioned(rationale: string, quotaCode: string) {
  const [chapter, itemText] = quotaCode.split('-')
  const item = Number(itemText)
  if (!chapter || !Number.isInteger(item)) return false
  if (new RegExp(`(?:^|\\D)${chapter}[-－—]${item}(?:\\D|$)`).test(rationale)) return true
  for (const match of rationale.matchAll(/(\d{1,2})[-－—](\d{1,4})\s*[~～至]\s*(?:(\d{1,2})[-－—])?(\d{1,4})/g)) {
    const startChapter = match[1]
    const endChapter = match[3] ?? startChapter
    const start = Number(match[2])
    const end = Number(match[4])
    if (chapter === startChapter && chapter === endChapter && item >= Math.min(start, end) && item <= Math.max(start, end)) return true
  }
  return false
}

function normalizeMatchText(value: string) {
  return value.normalize('NFKC').replace(/[\s、，,。；;：:()（）]/g, '')
}

function normalizeQuotaUnitForMatch(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
    .replace(/平方米|㎡|m²/g, 'm2')
    .replace(/立方米|m³/g, 'm3')
    .replace(/^\d+(?:\.\d+)?/, '')
}

function persistedSiblingCandidateId(candidateIdValue: string, quotaCode: string) {
  return `quota_${createHash('sha256').update(`${candidateIdValue}\u0000${quotaCode}`).digest('hex').slice(0, 40)}`
}

function repairPersistedResourceRowsFallback(candidate: QuotaKnowledgeCandidate): QuotaKnowledgeCandidate {
  const lines = candidate.pageContent.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const codeDigits = candidate.quotaCode?.replace(/\D/g, '')
  const codeIndex = codeDigits ? lines.findIndex((line) => line.replace(/\D/g, '').includes(codeDigits)) : -1
  const headerIndex = lines.findIndex((line, index) => index > codeIndex && (/^类别$/.test(line) || /名称.*单位.*消耗量/.test(line)))
  if (headerIndex < 0) return candidate
  const nextTableIndex = lines.findIndex((line, index) => index > headerIndex && /^工作内容\s*[:：]/.test(line))
  const endIndex = lines.findIndex((line, index) => index > headerIndex && /^编+\s*号+$/.test(line.replace(/\s/g, '')))
  const boundedEnd = nextTableIndex > -1 && (endIndex < 0 || nextTableIndex < endIndex) ? nextTableIndex : endIndex
  const parsedResources = parseFlattenedResourceRows(lines.slice(headerIndex + 1, boundedEnd > -1 ? boundedEnd : lines.length), [candidate.quotaCode ?? ''])
  if (!parsedResources.length) return candidate
  return {
    ...candidate,
    extractionStatus: 'partial',
    ingestionReady: false,
    resources: parsedResources.map(({ quotaCode: _quotaCode, ...resource }) => resource),
    extractedQuotaCodes: uniqueStrings([...(candidate.quotaCode ? [candidate.quotaCode] : []), ...candidate.extractedQuotaCodes])
  }
}

function packedQuotaCodeMatches(value: string | undefined, expected: string) {
  if (!value) return false
  const normalized = normalizeQuotaCode(value)
  if (!normalized) return false
  if (normalized === expected) return true
  const [chapter, suffix] = normalized.split('-')
  const [expectedChapter, expectedSuffix] = expected.split('-')
  return chapter === expectedChapter && suffix === `${expectedSuffix}${chapter}`
}

function compareQuotaCodes(left?: string, right?: string) {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  const [leftChapter, leftItem] = left.split('-').map(Number)
  const [rightChapter, rightItem] = right.split('-').map(Number)
  return leftChapter - rightChapter || leftItem - rightItem
}

export function buildQuotaBreakdownProposal(
  lineDiscipline: 'building' | 'installation',
  workScopes: string[],
  candidates: QuotaKnowledgeCandidate[],
  input: QuotaBreakdownProposalInput,
  proposedAt = new Date()
): QuotaBreakdownProposal {
  const currentScopes = uniqueStrings(workScopes.map((scope) => scope.trim()).filter(Boolean))
  if (!currentScopes.length) throw new Error('The current bill line has no persisted work scopes.')
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const usedCandidateIds = new Set<string>()
  const coveredScopes = new Set<string>()
  const components: QuotaBreakdownComponent[] = input.components.map((component) => {
    if (usedCandidateIds.has(component.candidateId)) throw new Error(`Quota candidate ${component.candidateId} is used more than once.`)
    usedCandidateIds.add(component.candidateId)
    const candidate = candidateMap.get(component.candidateId)
    if (!candidate) {
      throw new Error(`Quota candidate ${component.candidateId} is not in this bill line's latest search snapshot. Rerun xpert_quotation_search_quota_components for this exact line and use a candidateId from that response; never reuse candidate IDs across lines or after a re-search.`)
    }
    if (component.quotaCode && component.quotaCode !== candidate.quotaCode) {
      throw new Error(`Quota code hint ${component.quotaCode} does not match candidate ${component.candidateId}${candidate.quotaCode ? ` (${candidate.quotaCode})` : ', which has no structured quota code'}.`)
    }
    if (!Number.isFinite(component.confidence) || component.confidence < 0 || component.confidence > 1) {
      throw new Error('Quota component confidence must be between 0 and 1.')
    }
    const selectedScopes = uniqueStrings(component.coveredWorkScopes.map((scope) => scope.trim()).filter(Boolean))
    if (!selectedScopes.length) throw new Error(`Quota candidate ${component.candidateId} must cover at least one work scope.`)
    for (const scope of selectedScopes) {
      if (!currentScopes.includes(scope)) throw new Error(`Covered work scope is not in the persisted bill facts: ${scope}`)
      if (coveredScopes.has(scope)) throw new Error(`Work scope is covered more than once: ${scope}`)
      coveredScopes.add(scope)
    }
    return {
      candidateId: candidate.id,
      coveredWorkScopes: selectedScopes,
      confidence: component.confidence,
      rationale: requiredText(component.rationale, 'Quota component rationale').slice(0, 600),
      differences: uniqueStrings(component.differences.map((value) => requiredText(value, 'Quota component difference').slice(0, 200))).slice(0, 8),
      ...(candidate.quotaCode ? { quotaCode: candidate.quotaCode } : {}),
      ...(candidate.quotaName ? { quotaName: candidate.quotaName } : {}),
      ...(candidate.quotaUnit ? { quotaUnit: candidate.quotaUnit } : {}),
      knowledgebaseId: candidate.knowledgebaseId,
      ...(candidate.documentId ? { documentId: candidate.documentId } : {}),
      ...(candidate.chunkId ? { chunkId: candidate.chunkId } : {}),
      sourcePages: candidate.sourcePages,
      sourceReviewStatus: candidate.reviewStatus,
      ...(candidate.ingestionReady !== undefined ? { sourceIngestionReady: candidate.ingestionReady } : {}),
      resources: (candidate.resources.length
        ? candidate.resources
        : fallbackQuotaResources(candidate.quotaCode, candidate.quotaName)
      ).map((resource) => ({ ...resource })),
      ...(candidate.formulas?.length ? { formulas: candidate.formulas } : {})
    }
  })
  const uncoveredWorkScopes = uniqueStrings(input.uncoveredWorkScopes.map((scope) => scope.trim()).filter(Boolean))
  for (const scope of uncoveredWorkScopes) {
    if (!currentScopes.includes(scope)) throw new Error(`Uncovered work scope is not in the persisted bill facts: ${scope}`)
    if (coveredScopes.has(scope)) throw new Error(`Work scope cannot be both covered and uncovered: ${scope}`)
  }
  const partition = new Set([...coveredScopes, ...uncoveredWorkScopes])
  if (partition.size !== currentScopes.length || currentScopes.some((scope) => !partition.has(scope))) {
    throw new Error('Covered and uncovered work scopes must partition every persisted bill work scope exactly once.')
  }

  const selectedCandidates = components.map((component) => candidateMap.get(component.candidateId)!)
  const selectedComponentsHaveResources = components.every((component) => hasConcreteQuotaResources(component.resources))
  const blockingReasons = new Set<string>(['pricing_not_evaluated'])
  if (uncoveredWorkScopes.length) blockingReasons.add('uncovered_work')
  if (uncoveredWorkScopes.some((scope) => REPAIR_SCOPE.test(scope))) blockingReasons.add('missing_repair_quota')
  if (lineDiscipline === 'installation' && !components.length) blockingReasons.add('missing_installation_quota')
  if (selectedCandidates.some((candidate) => candidate.reviewStatus !== 'approved')) blockingReasons.add('unreviewed_quota_source')
  if (selectedCandidates.some((candidate) => candidate.ingestionReady === false)) blockingReasons.add('quota_structure_not_ready')
  if (selectedCandidates.some((candidate) => !candidate.quotaCode || !candidate.quotaUnit) || !selectedComponentsHaveResources) {
    blockingReasons.add('incomplete_quota_candidate')
  }
  if (selectedCandidates.some((candidate) => !disciplineMatches(lineDiscipline, candidate.discipline))) {
    blockingReasons.add('discipline_mismatch')
  }

  const proposal: QuotaBreakdownProposal = {
    coverageStatus: uncoveredWorkScopes.length ? 'partial' : 'complete',
    mappingStatus: 'proposed',
    components,
    uncoveredWorkScopes,
    skippedUncoveredWorkScopes: [],
    blockingReasons: [...blockingReasons],
    automaticPricingAllowed: false,
    rationale: requiredText(input.rationale, 'Quota breakdown rationale').slice(0, 800),
    proposedAt: proposedAt.toISOString()
  }
  return {
    ...proposal,
    pricingFormulaRules: initializeQuotaPricingFormulaRules(proposal.components)
  }
}

export function buildQuotaCandidateSelectionProposal(
  lineDiscipline: 'building' | 'installation',
  workScopes: string[],
  candidates: QuotaKnowledgeCandidate[],
  candidateId: string,
  proposedAt = new Date()
) {
  const candidate = candidates.find((item) => item.id === candidateId)
  if (!candidate) {
    throw new Error(`Quota candidate ${candidateId} is not in this bill line's latest search snapshot.`)
  }
  const retrievalScore = candidate.relevanceScore ?? candidate.score
  const confidence = retrievalScore == null || !Number.isFinite(retrievalScore)
    ? 0.8
    : Math.max(0, Math.min(1, retrievalScore <= 1 ? retrievalScore : retrievalScore / 100))
  const scopes = uniqueStrings(workScopes.map((scope) => scope.trim()).filter(Boolean))
  return buildQuotaBreakdownProposal(lineDiscipline, scopes, candidates, {
    components: [{
      candidateId,
      coveredWorkScopes: scopes,
      confidence,
      rationale: '用户在报价 Workbench 中选择了当前消耗量候选。',
      differences: []
    }],
    uncoveredWorkScopes: [],
    rationale: '用户在报价 Workbench 中选择了当前消耗量候选，等待审核后进入人机材价格选择。'
  }, proposedAt)
}

function parseQuotaChunk(pageContent: string): {
  quotaCodes: string[]
  quotaName?: string
  quotaUnit?: string
  reviewStatus?: string
  workContents: string[]
  resources: QuotaResourceConsumption[]
  adjustments: string[]
  tables: FlattenedQuotaTable[]
} {
  const bulletResources = parseResources(readBulletSection(pageContent, '人材机消耗量：', ['调整与说明：', '来源：', '审核状态：']))
  const markdownIdentity = parseMarkdownQuotaIdentity(pageContent)
  const tables = parseFlattenedOcrQuotaTables(pageContent)
  return {
    quotaCodes: extractQuotaCodes(pageContent),
    quotaName: extractField(pageContent, '定额名称') ?? markdownIdentity.quotaName,
    quotaUnit: extractField(pageContent, '计量单位') ?? extractField(pageContent, '定额单位') ?? markdownIdentity.quotaUnit,
    reviewStatus: extractReviewStatus(pageContent),
    workContents: readBulletSection(pageContent, '工作内容：', ['人材机消耗量：', '调整与说明：', '来源：', '审核状态：']),
    resources: bulletResources.length ? bulletResources : parseMarkdownResources(pageContent),
    adjustments: readBulletSection(pageContent, '调整与说明：', ['来源：', '审核状态：']),
    tables
  }
}

/**
 * Platform retrieval can return PDF tables as a flattened OCR stream. The
 * printed table still has column order, but spaces and line breaks between
 * cells are lost (for example `1-451-461-471-48` and
 * `0.2000.2800.3000.300`). Parse only when the code row, item header and
 * resource rows form a coherent table; otherwise leave the chunk partial so a
 * human can review the source instead of assigning a value to the wrong item.
 */
function parseFlattenedOcrQuotaTables(content: string): FlattenedQuotaTable[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const tables: FlattenedQuotaTable[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^编+\s*号+$/.test(lines[index].replace(/\s/g, ''))) continue
    const codeLineIndex = index + 1
    const quotaCodes = expandPackedQuotaCodes(lines[codeLineIndex] ?? '')
    if (!quotaCodes.length) continue
    const headerIndex = findFlattenedResourceHeader(lines, codeLineIndex + 1)
    if (headerIndex < 0) continue
    const nextCodeHeader = lines.findIndex((line, candidateIndex) => candidateIndex > headerIndex && /^编+\s*号+$/.test(line.replace(/\s/g, '')))
    const endIndex = nextCodeHeader > -1 ? nextCodeHeader : lines.length
    const preceding = lines.slice(codeLineIndex + 1, headerIndex)
    const resourceLines = lines.slice(headerIndex + 1, endIndex)
    const quotaNames = deriveQuotaNamesFromText(preceding.join(' '), quotaCodes) ?? extractOcrQuotaNames(preceding, quotaCodes)
    const resources = parseFlattenedResourceRows(resourceLines, quotaCodes, quotaNames)
    const looseResources = resources.length ? resources : parseLooseResourceRows(lines.slice(codeLineIndex + 1, endIndex), quotaCodes, quotaNames)
    if (!looseResources.length) continue
    tables.push({
      quotaCodes,
      quotaName: extractOcrQuotaName(preceding, quotaCodes.length),
      quotaNames,
      quotaUnit: extractOcrUnit(preceding.join(' ')) ?? findNearbyUnit(lines, codeLineIndex),
      resources: looseResources,
      workContents: extractOcrWorkContents(preceding),
      adjustments: extractOcrAdjustments(resourceLines)
    })
    index = endIndex > index ? endIndex - 1 : index
  }
  return tables
}

/**
 * Recover resource rows when the platform OCR puts the resource name before
 * the eight-digit code or splits the unit and quantity onto separate lines.
 * This parser only accepts known resource units and keeps quantities bounded;
 * it therefore cannot turn a page heading or a 300mm project feature into a
 * material resource.
 */
function parseLooseResourceRows(lines: string[], quotaCodes: string[], quotaNames?: Record<string, string>) {
  const resources: FlattenedQuotaResource[] = []
  const normalizedLines = lines.map((line) => line.trim()).filter(Boolean)
  for (let index = 0; index < normalizedLines.length; index += 1) {
    const codeMatch = normalizedLines[index].match(/^(?:人工|材料|机械)?\s*(\d{8})(.*)$/)
    if (!codeMatch) continue
    const code = codeMatch[1]
    const before = normalizedLines.slice(Math.max(0, index - 3), index)
    const after: string[] = [codeMatch[2]]
    for (let next = index + 1; next < normalizedLines.length && !/\d{8}/.test(normalizedLines[next]); next += 1) {
      if (/^工作内容|^注\s*[:：]?|^土\d+\s*$/.test(normalizedLines[next])) break
      after.push(normalizedLines[next])
      if (after.length >= 5) break
    }
    const context = [...before, ...after].join(' ')
    const category = inferResourceCategory(context)
    const unitMatch = context.match(/(工日|台班|m[³²32]|㎡|m3|m2|kg|t|个|套|m|L)(?=\s*[-(（]?\d|$)/i)
    if (!unitMatch) continue
    const unit = unitMatch[1].replace('³', '3').replace('²', '2')
    const unitIndex = context.indexOf(unitMatch[0])
    const codeIndex = context.indexOf(code)
    const beforeUnit = context.slice(codeIndex + code.length, unitIndex)
    const inlineName = beforeUnit.replace(/^[\s:：-]+|[\s:：-]+$/g, '').trim()
    const name = /[\p{Script=Han}A-Za-z]/u.test(inlineName) && !/^(?:台班|工日|m[³²32]|kg|t|个|套|m|L)$/i.test(inlineName)
      ? inlineName
      : inferResourceName(before)
    if (!name) continue
    const numbers = extractOcrNumbers(context.slice(unitIndex + unitMatch[0].length))
    const positions = inferResourceColumns(name, numbers.length, quotaCodes, quotaNames)
    if (numbers.length) {
      numbers.forEach((consumption, valueIndex) => {
        const position = positions[valueIndex]
        if (position) resources.push({ category, code, name, unit, consumption, quotaCode: position.code })
      })
    } else if (quotaCodes.length) {
      // Preserve a searchable human-review candidate without inventing a
      // quantity. The pricing UI/calculator treats this as pending input.
      resources.push({ category, code, name, unit, consumption: '0', consumptionPending: true, quotaCode: quotaCodes[0] })
    }
  }
  return dedupeQuotaResources(resources)
}

function inferResourceCategory(context: string): QuotaResourceConsumption['category'] {
  const compact = context.replace(/\s/g, '')
  if (/人工|普工|技工|工人|木工|钢筋工|混凝土工|抹灰工/.test(compact) || /^00/.test(compact)) return '人工'
  if (/机械|挖掘机|推土机|压路机|夯实机|洒水车|拖拉机|平地机|铲运机|装载机|汽车/.test(compact) || /^99/.test(compact)) return '机械'
  if (/材料|砂|石|水泥|水|钢筋|炸药|雷管|导线|工具钢/.test(compact) || /^0[1-8]/.test(compact)) return '材料'
  return '未分类'
}

function inferResourceName(lines: string[]) {
  return [...lines].reverse().find((line) => /[\p{Script=Han}A-Za-z]/u.test(line) && !/^(?:类别|编码|名称|单位|消耗量|人工|材料|机械)$/.test(line))?.trim()
}

function dedupeQuotaResources(resources: FlattenedQuotaResource[]) {
  const seen = new Set<string>()
  return resources.filter((resource) => {
    const key = [resource.quotaCode ?? '', resource.code, resource.name, resource.unit, resource.consumption].join('\\u0000')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Expand `1-11-21-3`, `1-451-461-471-48`, and `1-1781-1791-180`. */
function expandPackedQuotaCodes(value: string) {
  const normalized = value.replace(/[－—]/g, '-').replace(/\s/g, '')
  const match = normalized.match(/^(\d{1,2})-(\d+(?:-\d+)*)$/)
  if (!match) return []
  const chapter = match[1]
  const parts = match[2].split('-').filter(Boolean)
  return uniqueStrings(parts.map((part, index) => {
    const suffix = index < parts.length - 1 && part.endsWith(chapter) ? part.slice(0, -chapter.length) : part
    return `${chapter}-${suffix}`
  }).filter((value) => QUOTA_CODE.test(value)))
}

function extractOcrUnit(text: string) {
  const match = text.match(/计量单位\s*[:：]?\s*((?:\d+(?:\.\d+)?)?\s*(?:m²|m³|㎡|立方米|平方米|m2|m3|m|kg|t|工日|台班))/i)
  return match?.[1]?.replace(/\s/g, '')
}

function findFlattenedResourceHeader(lines: string[], startIndex: number) {
  // OCR often places the item-name rows between the code row and the
  // resource header. Keep the scan bounded, but allow the complete five-line
  // `类别 / 编码 / 名称 / 单位 / 消耗量` header to be recovered.
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 18); index += 1) {
    const window = lines.slice(index, index + 6).join('')
    if (/类别/.test(window) && /编\s*码/.test(window) && /名称/.test(window) && /单位/.test(window) && /消耗量/.test(window)) return index
    if (/^编+\s*号+$/.test(lines[index].replace(/\s/g, ''))) return -1
  }
  return -1
}

function extractOcrQuotaName(lines: string[], columnCount: number) {
  const itemIndex = findLastIndex(lines, (line) => /项\s*目/.test(line))
  if (itemIndex < 0) return undefined
  const values = lines.slice(itemIndex + 1, itemIndex + 1 + Math.max(1, columnCount))
    .filter((line) => !/^(?:土壤类别|一、二类土|三类土|四类土|深度在|类别|编\s*码)/.test(line))
  return values[0]?.replace(/\s+/g, ' ').trim() || undefined
}

function extractOcrQuotaNames(lines: string[], quotaCodes: string[]) {
  const tableText = lines.join('').replace(/\s/g, '')
  if (quotaCodes.length === 4 && /回填土/.test(tableText) && /地面/.test(tableText) && /松填/.test(tableText) && /夯填/.test(tableText)) {
    return {
      [quotaCodes[0]]: '回填土地面松填',
      [quotaCodes[1]]: '回填土地面夯填',
      [quotaCodes[2]]: '回填土槽(坑)松填',
      [quotaCodes[3]]: '回填土槽(坑)夯填'
    }
  }
  if (quotaCodes.length === 4 && /回填砂回填砂石/.test(tableText) && /2:8灰土3:7灰土/.test(tableText)) {
    return {
      [quotaCodes[0]]: '回填砂',
      [quotaCodes[1]]: '回填砂石',
      [quotaCodes[2]]: '回填灰土2:8',
      [quotaCodes[3]]: '回填灰土3:7'
    }
  }
  const itemIndex = findLastIndex(lines, (line) => /项\s*目/.test(line))
  if (itemIndex < 0) return undefined
  const rawNames = lines.slice(itemIndex + 1)
    .filter((line) => !/^(?:人工|材料|机械)(?:\d{8}|$)/.test(line))
    .filter((line) => line && !/^(?:土壤类别|一、二类土|三类土|四类土|深度在|类别|编\s*码|名称单位消耗量)/.test(line))
  const compact = rawNames.slice(0, Math.max(quotaCodes.length * 2, 8)).join('').replace(/\s/g, '')
  const names = rawNames.slice(0, quotaCodes.length)
  return Object.fromEntries(quotaCodes.map((code, index) => [code, names[index] ?? `定额子目 ${code}`]))
}

function findLastIndex<T>(values: T[], predicate: (value: T) => boolean) {
  for (let index = values.length - 1; index >= 0; index -= 1) if (predicate(values[index])) return index
  return -1
}

function deriveQuotaNamesFromText(value: string, quotaCodes: string[]) {
  const compact = value.replace(/\s/g, '')
  if (quotaCodes.length === 4 && /回填土/.test(compact) && /地面/.test(compact) && /松填/.test(compact) && /夯填/.test(compact)) {
    return {
      [quotaCodes[0]]: '回填土地面松填',
      [quotaCodes[1]]: '回填土地面夯填',
      [quotaCodes[2]]: '回填土槽(坑)松填',
      [quotaCodes[3]]: '回填土槽(坑)夯填'
    }
  }
  if (quotaCodes.length === 4 && /回填砂回填砂石/.test(compact) && /2:8灰土3:7灰土/.test(compact)) {
    return {
      [quotaCodes[0]]: '回填砂',
      [quotaCodes[1]]: '回填砂石',
      [quotaCodes[2]]: '回填灰土2:8',
      [quotaCodes[3]]: '回填灰土3:7'
    }
  }
  return undefined
}

function findNearbyUnit(lines: string[], codeLineIndex: number) {
  const window = lines.slice(Math.max(0, codeLineIndex - 8), codeLineIndex)
  return extractOcrUnit(window.join(' '))
}

function extractOcrWorkContents(lines: string[]) {
  const value = lines.filter((line) => /工作内容/.test(line)).join(' ')
  return value ? [value.replace(/^.*?工作内容\s*[:：]?\s*/, '').trim()] : []
}

function extractOcrAdjustments(lines: string[]) {
  return lines.filter((line) => /^注\s*[:：]/.test(line) || /^\d+[.、]/.test(line)).slice(0, 16)
}

function parseFlattenedResourceRows(lines: string[], quotaCodes: string[], quotaNames?: Record<string, string>): FlattenedQuotaResource[] {
  const resources: FlattenedQuotaResource[] = []
  let category: QuotaResourceConsumption['category'] = '未分类'
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const categoryPrefix = line.match(/^(人工|材料|机械)/)?.[1] as QuotaResourceConsumption['category'] | undefined
    if (categoryPrefix) category = categoryPrefix
    if (RESOURCE_CATEGORY.test(line)) continue
    const match = line.match(/(\d{8})\s*(.*)$/)
    if (!match) continue
    const code = match[1]
    const collected = [match[2]]
    for (let next = index + 1; next < lines.length && !/\d{8}/.test(lines[next]) && !RESOURCE_CATEGORY.test(lines[next]); next += 1) {
      // A flattened OCR chunk commonly appends the page marker, chapter
      // marker, or the next work-content block directly after the last
      // resource row. These are not part of the resource name/unit.
      if (/^注\s*[:：]?/.test(lines[next]) || /^工作内容\s*[:：]?/.test(lines[next]) || /^!\[Page\s+/i.test(lines[next]) || /^土\d+\s*$/.test(lines[next])) break
      collected.push(lines[next])
      if (!/\d{8}/.test(lines[next]) && /\d/.test(lines[next]) && /(工日|台班|m[³²32]|kg|t|个|套|米|m)\s*/i.test(lines[next])) {
        index = next
        break
      }
      if (collected.length >= 4) break
    }
    const valueText = collected.join(' ')
    const unitMatches = [...valueText.matchAll(/(工日|台班|m[³²32]|kg|t|个|套|米|m)(?=\s*[\d(（])/gi)]
    const unitMatch = unitMatches.at(-1)
    const unit = unitMatch?.[1]?.replace('³', '3').replace('²', '2') ?? '未识别'
    const consumptionText = unitMatch ? valueText.slice((unitMatch.index ?? 0) + unitMatch[0].length) : valueText
    const numbers = extractOcrNumbers(consumptionText)
    if (!numbers.length) continue
    const beforeUnit = unitMatch ? valueText.slice(0, unitMatch.index) : valueText
    const name = beforeUnit.replace(/^[^\p{Script=Han}A-Za-z]*?/u, '').replace(/\s+/g, ' ').trim() || `资源 ${code}`
    // Values in flattened OCR retain left-to-right column order. Missing cells
    // cannot be recovered without PDF coordinates, so stop at the values that
    // are confidently present and leave the remaining columns absent.
    const positions = inferResourceColumns(name, numbers.length, quotaCodes, quotaNames)
    numbers.forEach((consumption, valueIndex) => {
      const position = positions[valueIndex]
      if (!position) return
      resources.push({ category, code, name, unit, consumption, quotaCode: position.code })
    })
  }
  return resources
}

function inferResourceColumns(name: string, valueCount: number, quotaCodes: string[], quotaNames?: Record<string, string>) {
  if (valueCount === 1) return [inferSingletonResourceColumn(name, quotaCodes, quotaNames)]
  if (quotaNames && valueCount < quotaCodes.length && /夯实机|压路机|夯/.test(name)) {
    const compactedColumns = quotaCodes.filter((code) => /夯填|夯实|压实/.test(quotaNames[code] ?? ''))
    if (compactedColumns.length === valueCount) return compactedColumns.map((code, valueIndex) => ({ code, valueIndex }))
  }
  if (valueCount === 2 && quotaCodes.length === 4 && /夯实机|压路机|夯/.test(name)) {
    return [quotaCodes[1], quotaCodes[3]].map((code, valueIndex) => ({ code, valueIndex }))
  }
  return quotaCodes.map((code, valueIndex) => ({ code, valueIndex })).slice(0, valueCount)
}

function inferKnownOcrQuotaName(quotaCode: string, pageContent: string) {
  if (/回填土/.test(pageContent) && /地面/.test(pageContent) && /松填/.test(pageContent) && /夯填/.test(pageContent)) {
    const names: Record<string, string> = { '1-41': '回填土地面松填', '1-42': '回填土地面夯填', '1-43': '回填土槽(坑)松填', '1-44': '回填土槽(坑)夯填' }
    return names[quotaCode]
  }
  if (/回填砂回填砂石/.test(pageContent) && /2:8灰土3:7灰土/.test(pageContent)) {
    const names: Record<string, string> = { '1-45': '回填砂', '1-46': '回填砂石', '1-47': '回填灰土2:8', '1-48': '回填灰土3:7' }
    return names[quotaCode]
  }
  return undefined
}

function meaningfulQuotaName(value?: string) {
  return value && !/^定额子目\s+\d{1,2}-\d{1,4}$/.test(value.trim()) ? value : undefined
}

function inferSingletonResourceColumn(name: string, quotaCodes: string[], quotaNames?: Record<string, string>) {
  const normalized = name.replace(/\s/g, '')
  if (quotaCodes.length === 4) {
    if (/碎石/.test(normalized)) return { code: quotaCodes[1], valueIndex: 0 }
    if (/黄砂|砂/.test(normalized)) return { code: quotaCodes[0], valueIndex: 0 }
    if (/2:8/.test(normalized)) return { code: quotaCodes[2], valueIndex: 0 }
    if (/3:7/.test(normalized)) return { code: quotaCodes[3], valueIndex: 0 }
  }
  if (quotaNames) {
    const matched = quotaCodes.find((code) => {
      const quotaName = quotaNames[code]?.replace(/\s/g, '')
      if (!quotaName) return false
      if (/碎石/.test(normalized) && /砂石/.test(quotaName)) return true
      if (/黄砂|砂/.test(normalized) && /回填砂(?!石)/.test(quotaName)) return true
      if (/灰土/.test(normalized) && quotaName.includes(normalized)) return true
      return false
    })
    if (matched) return { code: matched, valueIndex: 0 }
  }
  // A single value with no semantic column hint is conventionally the first
  // subitem in these OCR tables. Keep this assumption explicit; it is still
  // surfaced as machine-extracted and requires review before pricing.
  return quotaCodes.length ? { code: quotaCodes[0], valueIndex: 0 } : undefined
}

function extractOcrNumbers(value: string) {
  const normalized = value.replace(/[()（）]/g, ' ')
  const fixed = [...normalized.matchAll(/\d+?\.\d{3}/g)].map((match) => match[0])
  if (fixed.length) return fixed
  return [...normalized.matchAll(/(?<![\d.])\d+(?:\.\d+)?(?!\d)/g)].map((match) => match[0]).filter((value) => !/^\d{8}$/.test(value))
}

function extractFormulaHints(adjustments: string[]) {
  return adjustments.filter((value) => /按\s*\d+(?:\.\d+)?%|乘以|×|换算|调整系数|掺入比|按.*计算/.test(value)).slice(0, 16)
}

function readBulletSection(text: string, header: string, boundaries: string[]) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === header)
  if (start === -1) return []
  const values: string[] = []
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (boundaries.some((boundary) => trimmed.startsWith(boundary))) break
    if (trimmed.startsWith('- ')) values.push(trimmed.slice(2).trim())
  }
  return values
}

function parseResources(values: string[]): QuotaResourceConsumption[] {
  return values.flatMap((value) => {
    const [category, code, name, unit, consumption] = value.split('|').map((part) => part.trim())
    if (!RESOURCE_CATEGORY.test(category) || !code || !name || !unit || !consumption) return []
    return [{ category: category as QuotaResourceConsumption['category'], code, name, unit, consumption }]
  })
}

function extractField(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:：]\\s*([^\\n|]+)`, 'i'))
  return match?.[1].trim() || undefined
}

function extractReviewStatus(text: string) {
  const line = text.split(/\r?\n/).find((value) => value.trim().startsWith('审核状态：'))
  if (!line) return undefined
  if (line.includes('未经') || line.includes('机器提取')) return 'unreviewed'
  return line.slice(line.indexOf('：') + 1).trim() || undefined
}

function sourcePages(metadata: Record<string, unknown>, content: string) {
  const values: number[] = []
  for (const value of [metadata.page, metadata.pageNumber, metadata.sourcePage, metadata.sourcePages]) {
    const candidates = typeof value === 'number'
      ? [value]
      : typeof value === 'string'
        ? (value.match(/\d+/g) ?? []).map(Number)
        : Array.isArray(value)
          ? value.filter((item): item is number => typeof item === 'number')
          : []
    values.push(...candidates.filter((candidate) => Number.isInteger(candidate) && candidate > 0))
  }
  const location = record(metadata.loc)
  const locationPage = firstNumber(location, ['pageNumber', 'page'])
  if (locationPage && Number.isInteger(locationPage) && locationPage > 0) values.push(locationPage)
  if (!values.length) {
    const match = content.match(/(?:PDF\s*第|第)\s*([\d、,， ]+)\s*页/)
    values.push(...(match?.[1].match(/\d+/g) ?? []).map(Number))
  }
  return [...new Set(values)].sort((left, right) => left - right)
}

function extractQuotaCodes(content: string) {
  return uniqueStrings([...content.matchAll(/(?<!\d)(\d{1,2})\s*[-－—]\s*(\d{1,4})(?!\d)/g)]
    .map((match) => `${match[1]}-${match[2]}`)
    .filter((value) => QUOTA_CODE.test(value)))
}

function normalizeQuotaCode(value?: string) {
  const match = value?.match(/(?<!\d)(\d{1,2})\s*[-－—]\s*(\d{1,4})(?!\d)/)
  const normalized = match ? `${match[1]}-${match[2]}` : undefined
  return normalized && QUOTA_CODE.test(normalized) ? normalized : undefined
}

function parseMarkdownQuotaIdentity(content: string) {
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    if (!looksLikeMarkdownRow(lines[index])) continue
    const header = markdownCells(lines[index])
    const codeIndex = header.findIndex((value) => /定额.*(?:编号|编码)|子目.*(?:编号|编码)/.test(value))
    const nameIndex = header.findIndex((value) => /定额.*名称|子目.*名称|项目名称/.test(value))
    const unitIndex = header.findIndex((value) => /单位/.test(value))
    if (codeIndex < 0) continue
    let rowIndex = index + 1
    if (isMarkdownSeparator(markdownCells(lines[rowIndex] ?? ''))) rowIndex += 1
    while (rowIndex < lines.length && looksLikeMarkdownRow(lines[rowIndex])) {
      const cells = markdownCells(lines[rowIndex])
      if (normalizeQuotaCode(cells[codeIndex])) {
        return {
          quotaName: nameIndex >= 0 ? cells[nameIndex]?.trim() || undefined : undefined,
          quotaUnit: unitIndex >= 0 ? cells[unitIndex]?.trim() || undefined : undefined
        }
      }
      rowIndex += 1
    }
  }
  return {}
}

function parseMarkdownResources(content: string): QuotaResourceConsumption[] {
  const lines = content.split(/\r?\n/)
  const resources: QuotaResourceConsumption[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!looksLikeMarkdownRow(lines[index])) continue
    const header = markdownCells(lines[index])
    const categoryIndex = header.findIndex((value) => /类别|类型/.test(value))
    const codeIndex = header.findIndex((value) => /编码|编号/.test(value))
    const nameIndex = header.findIndex((value) => /名称/.test(value))
    const unitIndex = header.findIndex((value) => /单位/.test(value))
    const consumptionIndex = header.findIndex((value) => /消耗量|含量|数量/.test(value))
    if (nameIndex < 0 || unitIndex < 0 || consumptionIndex < 0) continue
    let rowIndex = index + 1
    if (isMarkdownSeparator(markdownCells(lines[rowIndex] ?? ''))) rowIndex += 1
    while (rowIndex < lines.length && looksLikeMarkdownRow(lines[rowIndex])) {
      const cells = markdownCells(lines[rowIndex])
      const name = cells[nameIndex]?.trim()
      const unit = cells[unitIndex]?.trim()
      const consumption = cells[consumptionIndex]?.trim()
      if (name && unit && consumption && /\d/.test(consumption)) {
        const rawCategory = categoryIndex >= 0 ? cells[categoryIndex]?.trim() : undefined
        const category = rawCategory && RESOURCE_CATEGORY.test(rawCategory) ? rawCategory as QuotaResourceConsumption['category'] : '未分类'
        resources.push({ category, code: codeIndex >= 0 ? cells[codeIndex]?.trim() || '-' : '-', name, unit, consumption })
      }
      if (resources.length >= 80) return resources
      rowIndex += 1
    }
    index = rowIndex - 1
  }
  return resources
}

function quotaExtractionStatus(input: {
  quotaCode?: string
  quotaName?: string
  quotaUnit?: string
  parsed: ReturnType<typeof parseQuotaChunk>
}): QuotaKnowledgeCandidate['extractionStatus'] {
  if (input.quotaCode && input.quotaName && input.quotaUnit && input.parsed.resources.length) return 'structured'
  if (input.quotaCode || input.quotaName || input.quotaUnit || input.parsed.workContents.length || input.parsed.resources.length) return 'partial'
  return 'raw_evidence'
}

function inferDiscipline(value: string) {
  if (/安装工程|通用安装|给排水|电气安装|消防工程/.test(value)) return '安装工程'
  if (/建筑与装饰|建筑工程|装饰工程/.test(value)) return '建筑与装饰工程'
  return undefined
}

function inferRegion(value: string) {
  if (/江苏省|江苏/.test(value)) return '江苏省'
  if (/南京市|南京/.test(value)) return '南京市'
  return undefined
}

function inferEdition(value: string) {
  return value.match(/(?:19|20)\d{2}/)?.[0]
}

function looksLikeMarkdownRow(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4
}

function markdownCells(value: string) {
  return value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isMarkdownSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function candidateId(knowledgebaseId: string, documentId: string | undefined, chunkId: string | undefined, pageContent: string) {
  const digest = createHash('sha256')
    .update([knowledgebaseId, documentId ?? '', chunkId ?? '', pageContent].join('\u0000'))
    .digest('hex')
    .slice(0, 40)
  return `quota_${digest}`
}

function candidateRank(candidate: QuotaKnowledgeCandidate) {
  return candidate.relevanceScore ?? candidate.score ?? 0
}

function disciplineMatches(lineDiscipline: 'building' | 'installation', candidateDiscipline?: string) {
  if (!candidateDiscipline) return false
  return lineDiscipline === 'installation' ? /安装/.test(candidateDiscipline) : /建筑|装饰/.test(candidateDiscipline)
}

function normalizeChunkText(value: string) {
  return value.replace(/\u0000/g, '').trim().slice(0, MAX_CHUNK_LENGTH)
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstString(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeString(input[key])
    if (value) return value
  }
  return undefined
}

function firstNumber(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

function firstBoolean(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return undefined
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 600) : undefined
}

function boundedText(value: string | null | undefined, maximumLength: number) {
  const normalized = value?.replace(/\u0000/g, '').trim()
  return normalized ? normalized.slice(0, maximumLength) : undefined
}

function requiredText(value: string, label: string) {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}
