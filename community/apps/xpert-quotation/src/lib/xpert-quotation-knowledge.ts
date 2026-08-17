import { createHash } from 'node:crypto'
import type { KnowledgebaseDocument } from '@xpert-ai/plugin-sdk'
import type { XpertQuotationLine } from './entities/xpert-quotation-line.entity.js'
import type { KnowledgePriceCandidate, ResourceCategory, ResourcePriceItem } from './types.js'

const MAX_QUERY_LENGTH = 1_200
const MAX_SOURCE_CHUNK_LENGTH = 100_000
const MAX_CANDIDATE_EXCERPT_LENGTH = 4_800

const MATERIAL_TERMS = /混凝土|水泥|砂浆|级配砂石|砂石|碎石|石子|钢筋|钢材|型钢|角钢|槽钢|工字钢|铝合金|不锈钢|镀锌|钢管|管材|线管|电线|电缆|桥架|阀门|法兰|接头|螺栓|螺丝|砖|砌块|石材|大理石|花岗岩|地砖|墙砖|瓷砖|木材|板材|模板|龙骨|玻璃|门窗|乳胶漆|涂料|腻子|防水|卷材|密封胶|发泡|保温|隔热|灯具|灯带|插座|开关|洁具|洗脸盆|坐便器|水箱|波纹管|三角阀|土工布|材料|配件|面板|皮条/i

/** Bill rows may contain material facts even though their target is a comprehensive rate. */
export function hasMaterialReference(name?: string | null, specification?: string | null) {
  const text = `${name ?? ''} ${specification ?? ''}`.replace(/\s+/g, '')
  return Boolean(text) && MATERIAL_TERMS.test(text)
}

/** Only rows classified as material by workbook mapping use the material-price workflow. */
export function isMaterialPricingLine(line: Pick<XpertQuotationLine, 'kind' | 'materialReferenceOnly' | 'name' | 'specification'>) {
  return line.kind === 'material'
}

export function buildKnowledgePriceQuery(line: XpertQuotationLine) {
  const name = boundedText(line.name, 240) || '未提供'
  const unit = boundedText(line.unit, 80) || '未提供'
  const code = boundedText(line.code, 160)
  const fixedLines = [
    `材料名称：${name}`,
    `计量单位：${unit}`,
    ...(code ? [`材料编码：${code}`] : [])
  ]
  const specificationPrefix = '项目特征描述及规格：'
  const reservedLength = fixedLines.join('\n').length + specificationPrefix.length + 1
  const specification = boundedText(line.specification, Math.max(1, MAX_QUERY_LENGTH - reservedLength)) || '未提供'
  return [fixedLines[0], `${specificationPrefix}${specification}`, ...fixedLines.slice(1)].join('\n').slice(0, MAX_QUERY_LENGTH)
}

export function toKnowledgePriceCandidates(
  documents: KnowledgebaseDocument[],
  allowedKnowledgebaseIds: string[],
  query: string,
  retrievedAt = new Date()
) {
  const allowed = new Set(allowedKnowledgebaseIds)
  const fallbackKnowledgebaseId = allowed.size === 1 ? allowedKnowledgebaseIds[0] : undefined
  const candidates = new Map<string, KnowledgePriceCandidate>()

  for (const document of documents) {
    const metadata = record(document.metadata)
    const knowledgebaseId = firstString(metadata, ['knowledgebaseId', 'knowledgeBaseId', 'kbId']) ?? fallbackKnowledgebaseId
    if (!knowledgebaseId || !allowed.has(knowledgebaseId)) continue
    const sourceContent = normalizeSourceChunkText(document.pageContent)
    if (!sourceContent) continue
    const documentId = firstString(metadata, ['documentId', 'knowledgeDocumentId', 'knowledgeId'])
    const chunkId = firstString(metadata, ['chunkId']) ?? normalizeString(document.id)
    const documentName = firstString(metadata, ['documentName', 'originalFileName', 'filename', 'title', 'name'])
    const score = firstNumber(metadata, ['score'])
    const relevanceScore = firstNumber(metadata, ['relevanceScore'])
    const sourcePages = extractSourcePages(metadata, sourceContent)
    const priceItems = parseKnowledgePriceItems(sourceContent)
    const pageContent = buildPriceCandidateExcerpt(sourceContent, priceItems)
    const id = candidateId(knowledgebaseId, documentId, chunkId, sourceContent)
    const candidate: KnowledgePriceCandidate = {
      id,
      knowledgebaseId,
      ...(documentId ? { documentId } : {}),
      ...(chunkId ? { chunkId } : {}),
      ...(documentName ? { documentName } : {}),
      pageContent,
      ...(score !== undefined ? { score } : {}),
      ...(relevanceScore !== undefined ? { relevanceScore } : {}),
      sourcePages,
      priceItems,
      query,
      retrievedAt: retrievedAt.toISOString()
    }
    const current = candidates.get(id)
    if (!current || candidateRank(candidate) > candidateRank(current)) candidates.set(id, candidate)
  }

  return [...candidates.values()]
    .sort((left, right) => candidateRank(right) - candidateRank(left) || left.id.localeCompare(right.id))
}

export function parseMarkdownPriceItems(pageContent: string): KnowledgePriceCandidate['priceItems'] {
  const lines = pageContent.split(/\r?\n/)
  const items: KnowledgePriceCandidate['priceItems'] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!looksLikeMarkdownRow(lines[index])) continue
    const header = markdownCells(lines[index])
    const nameIndex = markdownNameColumn(header)
    const unitIndex = header.findIndex(isMarkdownUnitHeader)
    const priceIndex = header.findIndex(isMarkdownPriceHeader)
    if (nameIndex < 0 || unitIndex < 0 || priceIndex < 0) continue
    const categoryIndex = header.findIndex(isMarkdownCategoryHeader)
    const codeIndex = header.findIndex(isMarkdownResourceCodeHeader)
    const aliasesIndex = header.findIndex(isMarkdownAliasesHeader)
    let rowIndex = index + 1
    if (isMarkdownSeparator(markdownCells(lines[rowIndex] ?? ''))) rowIndex += 1
    while (rowIndex < lines.length && looksLikeMarkdownRow(lines[rowIndex])) {
      const evidenceQuote = lines[rowIndex].trim()
      const cells = markdownCells(evidenceQuote)
      const name = cells[nameIndex]?.trim()
      const rawUnit = cells[unitIndex]?.trim()
      const unitPrice = normalizePrice(cells[priceIndex])
      const resourceCategory = markdownResourceCategory(cells[categoryIndex])
      const laborPrice = resourceCategory === 'labor' || /工资/.test(header[priceIndex] ?? '')
      const unit = laborPrice && (!rawUnit || rawUnit === '元') ? '工日' : rawUnit
      const code = normalizeString(cells[codeIndex])
      const aliases = uniqueText([
        ...resourceNameAliases(name ?? ''),
        ...markdownAliases(cells[aliasesIndex])
      ])
      if (name && unit && unitPrice) items.push({
        name,
        unit,
        unitPrice,
        evidenceQuote,
        ...(resourceCategory ? { resourceCategory } : laborPrice ? { resourceCategory: 'labor' as const } : {}),
        ...(code ? { code } : {}),
        ...(aliases.length ? { aliases } : {})
      })
      if (items.length >= 40) return items
      rowIndex += 1
    }
    index = rowIndex - 1
  }
  return items
}

export function parseKnowledgePriceItems(pageContent: string): ResourcePriceItem[] {
  const workdayBasis = extractWorkdayBasis(pageContent)
  const parsed = [
    ...parseMarkdownPriceItems(pageContent),
    ...parseHtmlPriceTableItems(pageContent, workdayBasis?.hours),
    ...parseFlatLaborPriceItems(pageContent, workdayBasis?.hours),
    ...parseFlatPriceTableItems(pageContent)
  ].map((item) => ({
    ...item,
    ...(item.resourceCategory === 'labor' && workdayBasis && item.workdayHours === undefined
      ? { workdayHours: workdayBasis.hours }
      : {}),
    ...(item.resourceCategory === 'labor' && workdayBasis ? { workdayEvidenceQuote: workdayBasis.evidenceQuote } : {}),
    id: priceItemId(item)
  }))
  const unique = new Map<string, ResourcePriceItem>()
  for (const item of parsed) unique.set(item.id ?? priceItemId(item), item)
  return [...unique.values()]
}

/** Platform PDF ingestion commonly preserves tables as HTML instead of
 * Markdown. Only accept rows from an explicit price section (or a safe
 * machine-price continuation) so quota consumption rows cannot become prices. */
export function parseHtmlPriceTableItems(pageContent: string, workdayHours = extractWorkdayBasis(pageContent)?.hours) {
  if (!/<table\b/i.test(pageContent)) return []
  const normalized = normalizeFlatText(stripHtml(pageContent))
  const isLaborPrice = /建筑工种劳务市场人工信息价格|日工资/.test(normalized)
  const isMachinePrice = /机械租赁信息价格/.test(normalized)
  const isMaterialPrice = /建设工程材料市场信息价格|税前综合价格|材料市场信息价格/.test(normalized)
  const isMachineContinuation = !isLaborPrice && !isMachinePrice && !isMaterialPrice &&
    (normalized.match(/台班/g) ?? []).length >= 3 &&
    !/(?:定额编号|人材机消耗量|消耗量|类别\s*编码)/.test(normalized)
  if (!isLaborPrice && !isMachinePrice && !isMaterialPrice && !isMachineContinuation) return []

  const items: ResourcePriceItem[] = []
  for (const rowMatch of pageContent.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => cleanPriceName(stripHtml(cell[1])))
    if (cells.length < 4 || !/^\d{1,4}$/.test(cells[0])) continue
    const name = cells[1]
    const rawUnit = cells[2]
    const unitPrice = normalizePrice(cells[3])
    if (!name || !rawUnit || !unitPrice || isPriceTableHeader(name)) continue

    if (isLaborPrice) {
      if (!/^(?:元|元\/日|元\/工日|工日)$/.test(rawUnit)) continue
      const item: ResourcePriceItem = {
        resourceCategory: 'labor', name, aliases: resourceNameAliases(name), unit: '工日', unitPrice,
        ...(workdayHours !== undefined ? { workdayHours } : {}),
        evidenceQuote: `${name} 工日 ${unitPrice}`
      }
      items.push({ ...item, id: priceItemId(item) })
      continue
    }

    if (rawUnit === '元') continue
    const resourceCategory = rawUnit === '台班' ? 'machine' as const : 'material' as const
    const item: ResourcePriceItem = {
      resourceCategory, name, aliases: resourceNameAliases(name), unit: rawUnit, unitPrice,
      evidenceQuote: `${name} ${rawUnit} ${unitPrice}`
    }
    items.push({ ...item, id: priceItemId(item) })
  }
  return items
}

export function parseFlatLaborPriceItems(pageContent: string, workdayHours = extractWorkdayBasis(pageContent)?.hours) {
  if (!/(?:日工资|工种[\s\S]{0,20}工资|劳务[\s\S]{0,20}(?:价格|单价)|建筑工种|普工|木工|钢筋工|混凝土工|抹灰工)/.test(pageContent)) return []
  const items: ResourcePriceItem[] = []
  const normalized = laborTableSection(pageContent)
  // The platform's PDF/OCR chunker may remove every row break. Match the
  // stable labor-table shape: sequence, trade name, 元, daily wage.
  const rowPattern = /(?:^|\s)(\d{1,3})\s*([^\n]{2,120}?)\s*(?:元|元\/日|元\/工日)\s*([0-9]+(?:\.[0-9]+)?)(?=\s*\d{1,3}\s*[^\d\s]|\s+注[:：]|$)/g
  for (const match of normalized.matchAll(rowPattern)) {
    const name = cleanPriceName(match[2])
    if (!name || isPriceTableHeader(name)) continue
    const evidenceQuote = match[0].trim()
    const item: ResourcePriceItem = {
      resourceCategory: 'labor', name, aliases: resourceNameAliases(name), unit: '工日',
      unitPrice: match[3], ...(workdayHours !== undefined ? { workdayHours } : {}),
      evidenceQuote
    }
    items.push({ ...item, id: priceItemId(item) })
  }
  // Some OCR providers omit the sequence column. Keep this intentionally
  // role-scoped so a quota consumption number is never mistaken for a wage.
  if (!items.length) {
    const rolePattern = /((?:建筑、?装饰工程)?普工|建筑工|木工(?:（模板工）|\(模板工\))?|模板工|钢筋工|混凝土工|架子工|砌筑工(?:（砖瓦工）|\(砖瓦工\))?|砖瓦工|抹灰(?:、镶贴)?工(?:（一般抹灰）|\(一般抹灰\))?|装饰木工|防水工|油漆工|管工|电工|通风工|电焊工|起重工|玻璃工|金属制品安装工)\s*(?:日工资)?\s*(?:(?:元\s*\/\s*(?:日|工日|天))|元)\s*([0-9]+(?:\.[0-9]+)?)/g
    for (const match of normalized.matchAll(rolePattern)) {
      const name = cleanPriceName(match[1])
      const evidenceQuote = match[0].trim()
      const item: ResourcePriceItem = {
        resourceCategory: 'labor', name, aliases: resourceNameAliases(name), unit: '工日',
        unitPrice: match[2], ...(workdayHours !== undefined ? { workdayHours } : {}), evidenceQuote
      }
      items.push({ ...item, id: priceItemId(item) })
    }
  }
  return items
}

/** Parse OCR/PDF text where a material or machine table is one long line. */
export function parseFlatPriceTableItems(pageContent: string) {
  const normalized = normalizeFlatText(pageContent)
  const hasPriceHeader = /(?:税前综合价格|综合价格|材料市场信息价格|机械租赁信息价格|周转材料租赁信息价格)/.test(normalized)
  const isPriceContinuation = !hasPriceHeader &&
    (normalized.match(/台班/g) ?? []).length >= 3 &&
    !/(?:定额编号|人材机消耗量|消耗量|类别\s*编码)/.test(normalized)
  if (!hasPriceHeader && !isPriceContinuation) return []
  const items: ResourcePriceItem[] = []
  const unitPattern = '(?:百块|千块|m2|m3|mm2|cm2|cm3|km|mm|cm|m|kg|t|L|l|台班|100m\\/天|100m2\\/天|100套\\/天|100只\\/天|100根\\/天|元)'
  const rowPattern = new RegExp(`(?:^|\\s)(\\d{1,4})\\s*([^\\n]{2,180}?)\\s*(${unitPattern})\\s*([0-9]+(?:\\.[0-9]+)?)(?=\\s+\\d{1,4}\\s+|\\s+序号\\s+|\\s+本信息价|\\s+注[:：]|$)`, 'g')
  for (const match of normalized.matchAll(rowPattern)) {
    const name = cleanPriceName(match[2])
    const unit = match[3]
    const unitPrice = match[4]
    if (!name || isPriceTableHeader(name) || !unit || !unitPrice) continue
    // Unit 元 is reserved for labor rows. Other rows are material unless the
    // source explicitly says machine/台班.
    if (unit === '元') continue
    const resourceCategory = unit === '台班' ? 'machine' as const : 'material' as const
    const item: ResourcePriceItem = {
      resourceCategory, name, aliases: resourceNameAliases(name), unit, unitPrice,
      evidenceQuote: match[0].trim()
    }
    items.push({ ...item, id: priceItemId(item) })
  }
  return items
}

export function resourceNameAliases(name: string) {
  const normalized = name.normalize('NFKC').replace(/\s+/g, '')
  const aliases = new Set<string>()
  if (/普工/.test(normalized)) aliases.add('普工')
  if (/木工.*模板工|模板工/.test(normalized)) {
    aliases.add('木工')
    aliases.add('模板工')
  }
  if (/抹灰工.*一般抹灰|一般抹灰/.test(normalized)) aliases.add('抹灰工')
  if (/钢筋工/.test(normalized)) aliases.add('钢筋工')
  if (/混凝土工/.test(normalized)) aliases.add('混凝土工')
  if (/架子工/.test(normalized)) aliases.add('架子工')
  if (/砌筑工|砖瓦工/.test(normalized)) { aliases.add('砌筑工'); aliases.add('砖瓦工') }
  if (/防水工/.test(normalized)) aliases.add('防水工')
  if (/油漆工/.test(normalized)) aliases.add('油漆工')
  if (/管工/.test(normalized)) aliases.add('管道工')
  if (/电工/.test(normalized)) aliases.add('电工')
  aliases.delete(name)
  return [...aliases]
}

function normalizeFlatText(value: string) {
  return value.normalize('NFKC').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim()
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&times;|&#215;/gi, '×')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

function laborTableSection(value: string) {
  const normalized = normalizeFlatText(value)
  const markers = ['建筑工种劳务市场人工信息价格', '工种劳务市场人工信息价格', '日工资(元)', '日工资（元）']
  const start = Math.max(...markers.map((marker) => normalized.lastIndexOf(marker)))
  return start >= 0 ? normalized.slice(start) : normalized
}

function cleanPriceName(value: string) {
  return value.replace(/^[|｜]+|[|｜]+$/g, '').replace(/\s+/g, ' ').trim()
}

function isPriceTableHeader(value: string) {
  return /^(?:序号|名称|名称及规格|材料名称|规格|单位|日工资|税前综合价格|税前综合价格\(元\))$/.test(value.replace(/\s/g, ''))
}

function extractWorkdayBasis(text: string) {
  for (const line of text.split(/\r?\n/)) {
    const normalizedLine = line.normalize('NFKC').trim()
    const lineMatch = normalizedLine.match(/日工资.{0,12}?按(?:照)?(?:每日)?\s*([0-9]+(?:\.[0-9]+)?)\s*小时/)
    if (!lineMatch) continue
    const value = Number(lineMatch[1])
    if (Number.isFinite(value) && value > 0 && value <= 24) {
      const evidenceStart = Math.max(0, (lineMatch.index ?? 0) - (normalizedLine.slice(0, lineMatch.index).endsWith('注：') || normalizedLine.slice(0, lineMatch.index).endsWith('注:') ? 2 : 0))
      const evidenceQuote = normalizedLine.length <= 240
        ? line.trim()
        : normalizedLine.slice(evidenceStart, Math.min(normalizedLine.length, (lineMatch.index ?? 0) + lineMatch[0].length + 1))
      return { hours: value, evidenceQuote }
    }
  }
  const normalized = normalizeFlatText(text)
  const match = normalized.match(/日工资.{0,40}?按(?:照)?(?:每日)?\s*([0-9]+(?:\.[0-9]+)?)\s*小时/)
  if (match) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0 && value <= 24) {
      const start = Math.max(0, (match.index ?? 0) - 12)
      return { hours: value, evidenceQuote: normalized.slice(start, Math.min(normalized.length, (match.index ?? 0) + match[0].length + 8)) }
    }
  }
  return undefined
}

function priceItemId(item: Pick<ResourcePriceItem, 'name' | 'unit' | 'unitPrice' | 'workdayHours' | 'evidenceQuote'>) {
  return `price_${createHash('sha256').update([
    item.name,
    item.unit,
    item.unitPrice,
    item.workdayHours ?? '',
    item.evidenceQuote
  ].join('\u0000')).digest('hex').slice(0, 32)}`
}

export function evidenceAppearsInCandidate(candidate: KnowledgePriceCandidate, evidenceQuote: string) {
  const content = comparableText(candidate.pageContent)
  const quote = comparableText(evidenceQuote)
  return quote.length >= 4 && content.includes(quote)
}

export function evidenceSupportsUnitPrice(
  candidate: KnowledgePriceCandidate,
  evidenceQuote: string,
  unitPrice: string,
  sourceUnit: string
) {
  return evidenceAppearsInCandidate(candidate, evidenceQuote) && priceEvidenceSupports(evidenceQuote, unitPrice, sourceUnit)
}

export function priceEvidenceSupports(evidenceText: string, unitPrice: string, sourceUnit: string) {
  const normalizedPrice = canonicalDecimal(unitPrice)
  const numbers = normalizeNumericText(evidenceText).match(/[0-9]+(?:\.[0-9]+)?/g) ?? []
  return numbers.some((value) => canonicalDecimal(value) === normalizedPrice) && evidenceContainsUnit(evidenceText, sourceUnit)
}

function candidateId(knowledgebaseId: string, documentId: string | undefined, chunkId: string | undefined, pageContent: string) {
  const hash = createHash('sha256')
    .update([knowledgebaseId, documentId ?? '', chunkId ?? '', pageContent].join('\u0000'))
    .digest('hex')
    .slice(0, 40)
  return `kb_${hash}`
}

function candidateRank(candidate: KnowledgePriceCandidate) {
  return candidate.relevanceScore ?? candidate.score ?? 0
}

function normalizeSourceChunkText(value: string) {
  return value.replace(/\u0000/g, '').trim().slice(0, MAX_SOURCE_CHUNK_LENGTH)
}

/** Parse the complete platform chunk, then persist only source context plus
 * every structured row used as review evidence. This keeps late tables in
 * mixed price-book chunks discoverable without storing the whole price book
 * once for every quota resource search. */
function buildPriceCandidateExcerpt(sourceContent: string, priceItems: ResourcePriceItem[]) {
  if (!priceItems.length) return sourceContent.slice(0, MAX_CANDIDATE_EXCERPT_LENGTH)
  const evidence = uniqueText([
    ...priceItems.map((item) => item.evidenceQuote),
    ...priceItems.map((item) => item.workdayEvidenceQuote).filter((value): value is string => Boolean(value))
  ])
  const sourceContext = sourceContent.slice(0, 1_200)
  return [sourceContext, '结构化价格证据：', ...evidence]
    .join('\n')
    .slice(0, MAX_CANDIDATE_EXCERPT_LENGTH)
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function extractSourcePages(metadata: Record<string, unknown>, content: string) {
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
    const pageMatch = content.match(/(?:PDF\s*第|第)\s*([\d、,， ]+)\s*页/)
    values.push(...(pageMatch?.[1].match(/\d+/g) ?? []).map(Number))
  }
  return [...new Set(values)].sort((left, right) => left - right)
}

function looksLikeMarkdownRow(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4
}

function markdownCells(value: string) {
  return value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function markdownNameColumn(header: string[]) {
  const preferredHeaders = [
    '价格名称', '资源名称', '材料名称', '名称及规格', '规格及名称', '名称', '材料', '规格'
  ]
  const normalized = header.map(normalizeMarkdownHeader)
  for (const preferred of preferredHeaders) {
    const index = normalized.indexOf(preferred)
    if (index >= 0) return index
  }
  return normalized.findIndex((value) => /名称|材料|规格/.test(value) && !/ID|编号|编码|类别|来源|说明/.test(value))
}

function isMarkdownUnitHeader(value: string) {
  return /^(?:单位|计量单位|资源单位)$/.test(normalizeMarkdownHeader(value))
}

function isMarkdownPriceHeader(value: string) {
  const normalized = normalizeMarkdownHeader(value)
  if (/ID|编号|编码|名称|类别|来源|说明|日期|期次|价格期/.test(normalized)) return false
  return /^(?:(?:税前|税后|含税|不含税)?(?:综合)?(?:单价|价格|市场价|信息价)|日工资)(?:\([^)]*\))?$/.test(normalized)
}

function isMarkdownCategoryHeader(value: string) {
  return /^(?:类别|资源类别|价格类别)$/.test(normalizeMarkdownHeader(value))
}

function isMarkdownResourceCodeHeader(value: string) {
  return /^(?:关联定额资源编码|资源编码|材料编码|编码)$/.test(normalizeMarkdownHeader(value))
}

function isMarkdownAliasesHeader(value: string) {
  return /^(?:别名或规格|别名|规格型号|型号)$/.test(normalizeMarkdownHeader(value))
}

function normalizeMarkdownHeader(value: string) {
  return value.normalize('NFKC').replace(/[`*_\s]/g, '')
}

function markdownResourceCategory(value?: string): ResourceCategory | undefined {
  const normalized = value?.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return undefined
  if (/^(?:人工|劳务|labor)$/.test(normalized)) return 'labor'
  if (/^(?:材料|主材|辅材|material)$/.test(normalized)) return 'material'
  if (/^(?:机械|施工机械|machine)$/.test(normalized)) return 'machine'
  return undefined
}

function markdownAliases(value?: string) {
  if (!value) return []
  return value.split(/[;；、]/)
    .map((alias) => alias.trim())
    .filter((alias) => alias && alias !== '-' && alias !== '—')
}

function isMarkdownSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function normalizePrice(value?: string) {
  if (!value) return undefined
  const match = value.normalize('NFKC').replace(/[,，\s]/g, '').match(/(?:^|[^0-9])([0-9]+(?:\.[0-9]+)?)(?:[^0-9]|$)/)
  return match?.[1]
}

function comparableText(value: string) {
  return stripHtml(value).normalize('NFKC').toLowerCase().replace(/[|｜\s]+/g, '')
}

function normalizeNumericText(value: string) {
  return value.normalize('NFKC').replace(/[,，\s]/g, '')
}

function canonicalDecimal(value: string) {
  const [integer = '0', fraction = ''] = normalizeNumericText(value).split('.')
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '') || '0'
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger
}

function evidenceContainsUnit(evidenceText: string, sourceUnit: string) {
  const unit = normalizeUnitText(sourceUnit)
  if (!unit) return false
  const text = normalizeUnitText(evidenceText)
  if (/^[a-z0-9]+$/.test(unit)) {
    const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text)
  }
  return text.includes(unit)
}

function normalizeUnitText(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/平方米|平方公尺|㎡|m²/g, 'm2')
    .replace(/立方米|立方公尺|m³/g, 'm3')
    .replace(/千克|公斤/g, 'kg')
    .replace(/\s+/g, '')
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

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : undefined
}

function boundedText(value: string | null | undefined, maximumLength: number) {
  const normalized = value?.replace(/\u0000/g, '').trim()
  return normalized ? normalized.slice(0, maximumLength) : undefined
}
