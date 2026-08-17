import { createHash } from 'node:crypto'

export const QUOTA_SCHEMA_VERSION = 'xpert.quotation.quota-chunk/v1'
export const QUOTA_PARSER_VERSION = '1.0.0'

const QUOTA_CODE = /^\d{1,2}-\d{1,4}$/
const RESOURCE_CODE = /^\d{8}$/
const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/
const CATEGORY = /^(?:人工|材料|机械)$/
const UNIT = /^(?:\d+(?:\.\d+)?)?(?:m|m2|m3|mm|cm|km|kg|t|L|l|个|套|樘|块|组|台班|工日|百个|处|间|项|张|根|只|台|辆|孔|点|座|组日|部|系统|回路|榀|扇|延米|百分比)$/i
const SECTION = /^(\d+(?:\.\d+){1,4})\s+(.+)$/
const BLOCKING_WARNING_CODES = new Set([
  'missing_item_name',
  'missing_quota_unit',
  'missing_resource_header',
  'missing_resources',
  'unknown_resource_category'
])

export async function normalizeQuotaPdf({
  data,
  sourceFile,
  sourceHash,
  pageRange,
  onProgress
}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  })
  const pdf = await loadingTask.promise
  const range = normalizePageRange(pageRange, pdf.numPages)
  const state = { chapter: null, sectionCode: null, sectionTitle: null }
  const items = []
  const warnings = []
  let tableCount = 0
  let resourceRowCount = 0

  for (let pageNumber = range.start; pageNumber <= range.end; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const tokens = content.items.flatMap((item) => {
      if (!('str' in item) || !normalizeText(item.str)) return []
      return [{
        text: normalizeText(item.str),
        x: round(item.transform[4]),
        y: round(item.transform[5]),
        width: round(Math.max(item.width, 1)),
        height: round(Math.max(item.height, Math.abs(item.transform[3]), 1))
      }]
    })
    const lines = groupPdfTokens(tokens)
    const result = parseQuotaPageLayout({ pageNumber, lines, tokens, state })
    items.push(...result.items)
    warnings.push(...result.warnings)
    tableCount += result.tableCount
    resourceRowCount += result.resourceRowCount
    await onProgress?.({ pageNumber, pageCount: range.end - range.start + 1, itemCount: items.length })
  }

  const mergedItems = mergeContinuationItems(items)
  warnings.push(...mergedItems.flatMap((item) => item.warnings))
  const uniqueResultWarnings = uniqueWarnings(warnings)
  const chunks = mergedItems.map((item) => buildKnowledgeChunk(item, { sourceFile, sourceHash }))
  const duplicates = duplicateValues(chunks.map((chunk) => chunk.writeKey))
  for (const writeKey of duplicates) {
    uniqueResultWarnings.push({
      code: 'duplicate_write_key',
      page: null,
      quotaCodes: [writeKey],
      message: `Duplicate normalized quota write key: ${writeKey}.`
    })
  }

  return {
    pageCount: pdf.numPages,
    processedPageRange: range,
    tableCount,
    resourceRowCount,
    chunks,
    warnings: uniqueWarnings(uniqueResultWarnings)
  }
}

export function groupPdfTokens(tokens, tolerance = 2) {
  const lines = []
  for (const token of [...tokens].sort((left, right) => right.y - left.y || left.x - right.x)) {
    let line = lines.find((candidate) => Math.abs(candidate.y - token.y) <= tolerance)
    if (!line) {
      line = { y: token.y, tokens: [] }
      lines.push(line)
    }
    line.tokens.push(token)
  }
  return lines
    .map((line) => {
      const sorted = line.tokens.sort((left, right) => left.x - right.x)
      return { ...line, tokens: sorted, text: joinTokenText(sorted) }
    })
    .sort((left, right) => right.y - left.y)
}

export function parseQuotaPageLayout({ pageNumber, lines, tokens, state }) {
  const items = []
  const warnings = []
  let tableCount = 0
  let resourceRowCount = 0
  const pageLabel = findPageLabel(lines)

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    updateDocumentContext(state, lines[lineIndex])
    if (!isQuotaCodeLine(lines[lineIndex])) continue
    const table = parseQuotaTable({
      pageNumber,
      pageLabel,
      codeRowIndex: lineIndex,
      lines,
      tokens,
      context: { ...state }
    })
    tableCount += 1
    resourceRowCount += table.resourceRowCount
    items.push(...table.items)
    warnings.push(...table.warnings)
  }

  return { items, warnings, tableCount, resourceRowCount }
}

export function buildKnowledgeChunk(item, { sourceFile, sourceHash }) {
  const warningCodes = [...new Set(item.warnings.map((warning) => warning.code))]
  const reviewRequired = warningCodes.some((code) => BLOCKING_WARNING_CODES.has(code))
  const data = {
    quotaCode: item.quotaCode,
    quotaName: item.quotaName,
    quotaUnit: item.quotaUnit,
    chapter: item.chapter,
    sectionCode: item.sectionCode,
    sectionTitle: item.sectionTitle,
    workContents: item.workContents,
    resources: item.resources,
    adjustments: item.adjustments,
    formulas: extractFormulaHints(item.adjustments),
    source: {
      file: sourceFile,
      sha256: sourceHash,
      pdfPage: item.sourcePages[0],
      pdfPages: item.sourcePages,
      printedPage: item.printedPages[0] ?? null,
      printedPages: item.printedPages,
      excerpt: item.sourceExcerpt
    }
  }
  const contentHash = sha256(stableStringify(data))
  const writeKey = `quota:jiangsu:building-decoration:2026:${item.quotaCode}`
  const text = renderChunkText(data)

  return {
    schemaVersion: QUOTA_SCHEMA_VERSION,
    writeKey,
    title: `江苏省建筑与装饰工程消耗量（2026） ${item.quotaCode} ${item.quotaName}`,
    text,
    metadata: {
      domain: 'construction_cost',
      documentType: 'quota_item',
      region: '江苏省',
      edition: '2026',
      discipline: '建筑与装饰工程',
      quotaCode: item.quotaCode,
      quotaUnit: item.quotaUnit,
      chapter: item.chapter ?? '',
      sectionCode: item.sectionCode ?? '',
      sourceFile,
      sourcePage: item.sourcePages[0],
      sourcePages: item.sourcePages.join(','),
      printedPage: item.printedPages[0] ?? '',
      sourceSha256: sourceHash,
      parserVersion: QUOTA_PARSER_VERSION,
      reviewStatus: 'unreviewed',
      ingestionReady: !reviewRequired,
      contentHash
    },
    data,
    warnings: item.warnings
  }
}

export function summarizeNormalization(result, { sourceFile, sourceHash, generatedAt }) {
  const warningCounts = result.warnings.reduce((counts, warning) => {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1
    return counts
  }, {})
  const readyCount = result.chunks.filter((chunk) => chunk.metadata.ingestionReady).length
  return {
    schemaVersion: 'xpert.quotation.quota-manifest/v1',
    parserVersion: QUOTA_PARSER_VERSION,
    generatedAt,
    source: {
      file: sourceFile,
      sha256: sourceHash,
      totalPdfPages: result.pageCount,
      processedPageRange: result.processedPageRange
    },
    counts: {
      tables: result.tableCount,
      quotaItems: result.chunks.length,
      ingestionReady: readyCount,
      reviewRequired: result.chunks.length - readyCount,
      resourceRows: result.resourceRowCount,
      warnings: result.warnings.length
    },
    warningCounts,
    missingRequiredSources: [
      {
        code: 'jiangsu_repair_2009',
        name: '江苏省房屋修缮工程计价表（2009年）',
        reason: '现有 2026 消耗量明确排除拆除、铲除、拆换和零星修补。'
      },
      {
        code: 'jiangsu_installation_2026',
        name: '江苏省通用安装工程消耗量（2026）',
        reason: '原报价文件包含安装工程清单，现有建筑与装饰 PDF 不覆盖安装项目。'
      },
      {
        code: 'jiangsu_fee_rules',
        name: '目标计价口径的管理费、利润和风险费率规则',
        reason: '综合单价费用组成必须由版本化计价规则驱动。'
      }
    ],
    availableSupportingSources: [
      {
        code: 'nanjing_price_2026_06',
        name: '南京市二〇二六年六月建设工程材料、机械及劳务市场信息价格',
        file: 'docs/价格信息.pdf',
        status: 'present_not_normalized',
        reason: '已发现价格期来源；尚未由本定额规范化脚本生成价格项 NDJSON，也尚未确认已上传到 Xpert 知识库。'
      }
    ],
    ingestionPolicy: {
      defaultReviewStatus: 'unreviewed',
      allowAutomaticPricing: false,
      requiredHumanChecks: [
        '核对定额名称、计量单位和人材机列对应关系',
        '核对调整系数、适用条件和排除项',
        '补齐缺失计价依据和价格期数据后再标记为 approved'
      ]
    }
  }
}

function parseQuotaTable({ pageNumber, pageLabel, codeRowIndex, lines, tokens, context }) {
  const codeRow = lines[codeRowIndex]
  const codeTokens = codeRow.tokens.flatMap((token) => {
    const matches = normalizeText(token.text).match(/\d{1,2}-\d{1,4}/g) ?? []
    return matches.filter((value) => QUOTA_CODE.test(value)).map((value) => ({
      code: value,
      x: token.x,
      width: token.width
    }))
  })
  const quotaCodes = codeTokens.map((token) => token.code)
  const warnings = []
  const resourceHeaderIndex = findResourceHeader(lines, codeRowIndex + 1)
  if (resourceHeaderIndex === -1) {
    warnings.push(tableWarning('missing_resource_header', pageNumber, quotaCodes, 'No 类别/编码/名称/单位/消耗量 header was found below the quota codes.'))
    return { items: [], warnings, resourceRowCount: 0 }
  }

  const header = readResourceHeader(lines[resourceHeaderIndex], codeTokens)
  if (!header) {
    warnings.push(tableWarning('missing_resource_header', pageNumber, quotaCodes, 'The resource header columns could not be resolved.'))
    return { items: [], warnings, resourceRowCount: 0 }
  }

  const blockEnd = findTableBlockEnd(lines, resourceHeaderIndex + 1)
  const resourceRegion = lines.slice(resourceHeaderIndex + 1, blockEnd)
  const categoryAnchors = resourceRegion.flatMap((line) => line.tokens
    .filter((token) => CATEGORY.test(normalizeCompact(token.text)))
    .map((token) => ({ category: normalizeCompact(token.text), y: line.y })))
  const resourceRows = []
  for (let index = resourceHeaderIndex + 1; index < blockEnd; index += 1) {
    const row = parseResourceLine({
      line: lines[index],
      followingLines: lines.slice(index + 1, blockEnd),
      tokens,
      header,
      codeTokens,
      categoryAnchors
    })
    if (row) resourceRows.push(row)
  }

  const work = readWorkContext(lines, tokens, codeRowIndex)
  const itemHeaders = readItemHeaders({
    lines: lines.slice(codeRowIndex + 1, resourceHeaderIndex),
    tokens,
    codeTokens,
    valueBoundary: header.valueBoundary
  })
  const lastResourceIndex = findLastResourceLineIndex(lines, resourceHeaderIndex + 1, blockEnd)
  const adjustments = readAdjustments(lines, lastResourceIndex + 1, blockEnd)
  const sourceExcerpt = lines
    .slice(work.startIndex ?? codeRowIndex, blockEnd)
    .map((line) => line.text)
    .filter((text) => normalizeCompact(text) && !/^\d+$/.test(normalizeCompact(text)))
    .join('\n')
    .slice(0, 12_000)

  const items = codeTokens.map(({ code }) => {
    const itemWarnings = [...warnings]
    const quotaName = itemHeaders.names.get(code) || `定额子目 ${code}`
    const quotaUnit = normalizeQuotaUnit(
      work.quotaUnit !== '见表' ? work.quotaUnit : itemHeaders.units.get(code)
    )
    const resources = resourceRows.flatMap((resource) => {
      const consumption = resource.values.get(code)
      return consumption === undefined ? [] : [{
        category: resource.category,
        code: resource.code,
        name: resource.name,
        unit: resource.unit,
        consumption,
        consumptionKind: resource.unit === '%' ? 'percentage' : 'quantity'
      }]
    })
    if (!itemHeaders.names.get(code)) {
      itemWarnings.push(tableWarning('missing_item_name', pageNumber, [code], 'The item name was not resolved from the quota table header.'))
    }
    if (!quotaUnit || quotaUnit === '见表') {
      itemWarnings.push(tableWarning('missing_quota_unit', pageNumber, [code], 'The quota unit was not resolved.'))
    }
    if (!resources.length) {
      itemWarnings.push(tableWarning('missing_resources', pageNumber, [code], 'No resource consumption rows were associated with this item.'))
    }
    if (resources.some((resource) => resource.category === '未分类')) {
      itemWarnings.push(tableWarning('unknown_resource_category', pageNumber, [code], 'At least one resource row has no 人工/材料/机械 category.'))
    }
    if (!work.workContents.length) {
      itemWarnings.push(tableWarning('missing_work_content', pageNumber, [code], 'No 工作内容 text was found immediately above this table.'))
    }
    return {
      quotaCode: code,
      quotaName,
      quotaUnit: quotaUnit || '未识别',
      chapter: context.chapter,
      sectionCode: context.sectionCode,
      sectionTitle: context.sectionTitle,
      workContents: work.workContents,
      resources,
      adjustments,
      sourcePages: [pageNumber],
      printedPages: pageLabel ? [pageLabel] : [],
      sourceExcerpt,
      warnings: uniqueWarnings(itemWarnings)
    }
  })

  return { items, warnings, resourceRowCount: resourceRows.length }
}

function readResourceHeader(line, codeTokens) {
  const anchors = new Map()
  for (const label of ['编码', '名称', '单位', '消耗量']) {
    const anchor = findHeaderAnchor(line.tokens, label)
    if (anchor !== null) anchors.set(label, anchor)
  }
  if (![...['编码', '名称', '单位', '消耗量']].every((key) => anchors.has(key))) return null
  const centers = codeTokens.map((token) => token.x).sort((left, right) => left - right)
  const spacing = centers.length > 1 ? median(differences(centers)) : 90
  return {
    codeX: anchors.get('编码'),
    nameX: anchors.get('名称'),
    unitX: anchors.get('单位'),
    valueX: anchors.get('消耗量'),
    unitStart: anchors.get('单位') - 15,
    valueBoundary: centers[0] - spacing / 2,
    centers,
    spacing
  }
}

function findHeaderAnchor(tokens, label) {
  const exact = tokens.find((token) => normalizeCompact(token.text) === label)
  if (exact) return exact.x
  if (label.length !== 2) return null
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (normalizeCompact(tokens[index].text) !== label[0]) continue
    const next = tokens.slice(index + 1).find((token) => normalizeCompact(token.text) === label[1] && token.x - tokens[index].x <= 30)
    if (next) return tokens[index].x
  }
  return null
}

function parseResourceLine({ line, followingLines, tokens, header, codeTokens, categoryAnchors }) {
  const codeToken = line.tokens.find((token) => RESOURCE_CODE.test(normalizeCompact(token.text)))
  if (!codeToken) return null
  const code = normalizeCompact(codeToken.text)
  const codeEnd = codeToken.x + codeToken.width
  const nameTokens = line.tokens.filter((token) => token.x >= codeEnd - 2 && token.x < header.unitStart)
  const continuation = readResourceNameContinuation(followingLines, codeEnd, header.unitStart, header.valueBoundary)
  const name = normalizeText([joinTokenText(nameTokens), continuation].filter(Boolean).join(' ')) || `资源 ${code}`
  const unitTokens = line.tokens.filter((token) => token.x >= header.unitStart && token.x < header.valueBoundary)
  const unit = normalizeResourceUnit(joinTokensWithSuperscripts(unitTokens, tokens, line.y)) || '未识别'
  const valueTokens = line.tokens.filter((token) => token.x >= header.valueBoundary && isNumberToken(token.text))
  const values = assignValues(valueTokens, codeTokens, header.spacing)
  const category = inferResourceCategory(code) ?? nearestCategory(line.y, categoryAnchors) ?? '未分类'
  return { category, code, name, unit, values }
}

function readResourceNameContinuation(lines, nameStart, unitStart, valueBoundary) {
  const parts = []
  for (const line of lines) {
    if (line.tokens.some((token) => RESOURCE_CODE.test(normalizeCompact(token.text)))) break
    if (isQuotaCodeLine(line) || isResourceHeader(line) || isStructuralBoundary(line)) break
    if (line.tokens.some((token) => token.x >= valueBoundary && isNumberToken(token.text))) break
    const tokens = line.tokens.filter((token) => token.x >= Math.min(nameStart, 120) && token.x < unitStart)
    const text = joinTokenText(tokens)
    if (text && !CATEGORY.test(normalizeCompact(text))) parts.push(text)
    if (parts.length >= 2) break
  }
  return parts.join(' ')
}

function assignValues(valueTokens, codeTokens, spacing) {
  const values = new Map()
  for (const token of valueTokens) {
    const target = nearestBy(token.x, codeTokens, (item) => item.x)
    if (!target) continue
    if (codeTokens.length > 1 && Math.abs(token.x - target.x) > spacing * 0.55 + 4) continue
    values.set(target.code, normalizeNumber(token.text))
  }
  return values
}

function readItemHeaders({ lines, tokens, codeTokens, valueBoundary }) {
  const names = new Map(codeTokens.map(({ code }) => [code, []]))
  const units = new Map()
  const centers = codeTokens.map((token) => token.x)
  const meanCenter = mean(centers)
  const spacing = centers.length > 1 ? median(differences([...centers].sort((a, b) => a - b))) : 90

  for (const line of lines) {
    const itemTokens = line.tokens.filter((token) => token.x >= valueBoundary && !/^[23]$/.test(normalizeCompact(token.text)))
    if (!itemTokens.length) continue
    const groups = new Map()
    for (const token of itemTokens) {
      const target = nearestBy(token.x, codeTokens, (item) => item.x)
      if (!target) continue
      const current = groups.get(target.code) ?? []
      current.push(token)
      groups.set(target.code, current)
    }
    if (!groups.size) continue
    const textByCode = new Map([...groups].map(([code, group]) => [
      code,
      joinTokensWithSuperscripts(group, tokens, line.y)
    ]))
    const allBounds = itemTokens.reduce((bounds, token) => ({
      start: Math.min(bounds.start, token.x),
      end: Math.max(bounds.end, token.x + token.width)
    }), { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY })
    const visualCenter = (allBounds.start + allBounds.end) / 2
    const shared = codeTokens.length > 1 && groups.size === 1 && Math.abs(visualCenter - meanCenter) <= Math.max(22, spacing * 0.3)

    if (shared) {
      const text = [...textByCode.values()][0]
      if (isUnit(text)) {
        for (const { code } of codeTokens) units.set(code, normalizeQuotaUnit(text))
      } else {
        for (const { code } of codeTokens) names.get(code).push(text)
      }
      continue
    }
    for (const [code, text] of textByCode) {
      if (isUnit(text)) units.set(code, normalizeQuotaUnit(text))
      else names.get(code).push(text)
    }
  }

  return {
    names: new Map([...names].map(([code, parts]) => [code, uniqueText(parts).join(' ')])),
    units
  }
}

function readWorkContext(lines, tokens, codeRowIndex) {
  let startIndex = null
  for (let index = codeRowIndex - 1; index >= 0; index -= 1) {
    if (isQuotaCodeLine(lines[index])) break
    if (normalizeCompact(lines[index].text).includes('工作内容')) {
      startIndex = index
      break
    }
    if (codeRowIndex - index > 10) break
  }
  if (startIndex === null) return { startIndex: null, quotaUnit: null, workContents: [] }
  const contextLines = lines.slice(startIndex, codeRowIndex)
  const unitLine = contextLines.find((line) => normalizeCompact(line.text).includes('计量单位'))
  const quotaUnit = unitLine ? extractQuotaUnit(unitLine, tokens) : null
  const workText = contextLines
    .map((line) => stripUnitText(line.text))
    .map((text) => normalizeText(text))
    .filter((text) => text && !/^\d+$/.test(normalizeCompact(text)))
    .join(' ')
    .replace(/^工作内容[:：]?\s*/, '')
  return { startIndex, quotaUnit: normalizeQuotaUnit(quotaUnit), workContents: splitWorkContents(workText) }
}

function extractQuotaUnit(line, allTokens) {
  const token = line.tokens.find((candidate) => normalizeCompact(candidate.text).includes('计量单位'))
  if (!token) return null
  const nearby = allTokens
    .filter((candidate) => candidate.x >= token.x && Math.abs(candidate.y - line.y) <= 8)
    .sort((left, right) => left.x - right.x)
  const text = joinTokensWithSuperscripts(nearby, allTokens, line.y)
  return text.replace(/^.*?计量单位[:：]?/, '')
}

function readAdjustments(lines, startIndex, endIndex) {
  const parts = lines
    .slice(Math.max(0, startIndex), endIndex)
    .map((line) => normalizeText(line.text))
    .filter((text) => text && !/^\d+$/.test(normalizeCompact(text)))
  if (!parts.some((text) => normalizeCompact(text).startsWith('注'))) return []
  const text = parts.join(' ').replace(/^注[:：]?\s*/, '')
  return splitNumberedText(text)
}

function extractFormulaHints(adjustments) {
  return adjustments.filter((value) => /按\s*\d+(?:\.\d+)?%|乘以|×|换算|调整系数|掺入比|按.*计算/.test(value)).slice(0, 16)
}

function renderChunkText(data) {
  const lines = [
    `定额编号：${data.quotaCode}`,
    `定额名称：${data.quotaName}`,
    `地区及版本：江苏省 2026 建筑与装饰工程消耗量`,
    `章节：${[data.sectionCode, data.sectionTitle].filter(Boolean).join(' ') || data.chapter || '未识别'}`,
    `计量单位：${data.quotaUnit}`,
    '工作内容：',
    ...(data.workContents.length ? data.workContents.map((value) => `- ${value}`) : ['- 未识别']),
    '人材机消耗量：',
    ...data.resources.map((resource) =>
      `- ${resource.category} | ${resource.code} | ${resource.name} | ${resource.unit} | ${resource.consumption}`
    ),
    ...(data.adjustments.length ? ['调整与说明：', ...data.adjustments.map((value) => `- ${value}`)] : []),
    ...(data.formulas?.length ? ['计算公式/调整提示：', ...data.formulas.map((value) => `- ${value}`)] : []),
    `来源：${data.source.file}，PDF 第 ${data.source.pdfPages.join('、')} 页${data.source.printedPages.length ? `，印刷页码 ${data.source.printedPages.join('、')}` : ''}`,
    '审核状态：机器提取，未经造价人员复核，不得直接用于自动计价。'
  ]
  return lines.join('\n')
}

function updateDocumentContext(state, line) {
  const compact = normalizeCompact(line.text)
  if (/^第[一二三四五六七八九十百0-9]+章/.test(compact)) {
    state.chapter = normalizeText(line.text)
  }
  if (isStructuralBoundary(line)) {
    const match = normalizeText(line.text).match(SECTION)
    if (match) {
      state.sectionCode = match[1]
      state.sectionTitle = removeRepeatedSection(match[1], match[2])
    }
  }
}

function isStructuralBoundary(line) {
  const text = normalizeText(line.text)
  if (!text || normalizeCompact(text).startsWith('工作内容')) return false
  return SECTION.test(text) || /^第[一二三四五六七八九十百0-9]+章/.test(normalizeCompact(text))
}

function isQuotaCodeLine(line) {
  const compact = normalizeCompact(line.text)
  return compact.includes('编') && compact.includes('号') && line.tokens.some((token) => QUOTA_CODE.test(normalizeCompact(token.text)))
}

function isResourceHeader(line) {
  const compact = normalizeCompact(line.text)
  return ['编码', '名称', '单位', '消耗量'].every((label) => compact.includes(label))
}

function findResourceHeader(lines, startIndex) {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 14); index += 1) {
    if (isResourceHeader(lines[index])) return index
    if (isQuotaCodeLine(lines[index])) return -1
  }
  return -1
}

function findTableBlockEnd(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const compact = normalizeCompact(lines[index].text)
    if (lines[index].y < 65) return index
    if (compact.startsWith('工作内容') || isQuotaCodeLine(lines[index]) || isStructuralBoundary(lines[index])) return index
  }
  return lines.length
}

function findLastResourceLineIndex(lines, startIndex, endIndex) {
  let result = startIndex - 1
  for (let index = startIndex; index < endIndex; index += 1) {
    if (lines[index].tokens.some((token) => RESOURCE_CODE.test(normalizeCompact(token.text)))) result = index
  }
  return result
}

function findPageLabel(lines) {
  const footer = [...lines].reverse().find((line) => line.y < 65 && /\d/.test(line.text))
  return footer ? normalizeText(footer.text) : null
}

function nearestCategory(y, anchors) {
  return nearestBy(y, anchors, (anchor) => anchor.y)?.category ?? null
}

function inferResourceCategory(code) {
  if (/^0015/.test(code)) return '人工'
  if (/^99/.test(code)) return '机械'
  if (RESOURCE_CODE.test(code)) return '材料'
  return null
}

function nearestBy(value, items, selector) {
  let selected = null
  let distance = Number.POSITIVE_INFINITY
  for (const item of items) {
    const next = Math.abs(value - selector(item))
    if (next < distance) {
      selected = item
      distance = next
    }
  }
  return selected
}

function joinTokensWithSuperscripts(tokens, allTokens, y) {
  const parts = []
  const sorted = [...tokens].sort((left, right) => left.x - right.x)
  for (const token of sorted) {
    if (/^[23]$/.test(normalizeCompact(token.text)) && sorted.some((candidate) =>
      /[mM]$/.test(normalizeText(candidate.text)) &&
      token.x >= candidate.x + candidate.width - 3 &&
      token.x <= candidate.x + candidate.width + 12 &&
      Math.abs(token.y - candidate.y) <= 9
    )) continue
    let text = normalizeText(token.text)
    if (/[mM]$/.test(text)) {
      const superscript = allTokens.find((candidate) =>
        /^[23]$/.test(normalizeCompact(candidate.text)) &&
        candidate.x >= token.x + token.width - 3 &&
        candidate.x <= token.x + token.width + 12 &&
        Math.abs(candidate.y - y) <= 9
      )
      if (superscript) text += normalizeCompact(superscript.text)
    }
    parts.push(text)
  }
  return normalizeText(parts.join(' '))
}

function joinTokenText(tokens) {
  return normalizeText(tokens.map((token) => token.text).join(' '))
}

function splitWorkContents(text) {
  return splitNumberedText(text)
    .map((value) => value.replace(/^\d+[.．、]\s*/, '').trim())
    .filter(Boolean)
}

function splitNumberedText(text) {
  const normalized = normalizeText(text)
  const matches = [...normalized.matchAll(/(?:^|\s)(\d+)[.．、](?!\d)\s*/g)]
  if (!matches.length) return normalized ? [normalized] : []
  return matches.map((match, index) => {
    const start = match.index + match[0].length
    const end = matches[index + 1]?.index ?? normalized.length
    return normalized.slice(start, end).trim()
  }).filter(Boolean)
}

function stripUnitText(text) {
  const index = normalizeCompact(text).indexOf('计量单位')
  if (index === -1) return text
  const visibleIndex = text.indexOf('计量单位')
  return visibleIndex === -1 ? text : text.slice(0, visibleIndex)
}

function normalizeQuotaUnit(value) {
  if (!value) return null
  return normalizeCompact(value)
    .replace(/平方米|㎡|m²/gi, 'm2')
    .replace(/立方米|m³/gi, 'm3')
    .replace(/米(?=$|\d)/g, 'm')
}

function normalizeResourceUnit(value) {
  const unit = normalizeQuotaUnit(value)
  if (!unit) return null
  return unit.replace(/千克|公斤/g, 'kg')
}

function isUnit(value) {
  const unit = normalizeQuotaUnit(value)
  return Boolean(unit && UNIT.test(unit))
}

function isNumberToken(value) {
  return NUMBER.test(normalizeNumber(value))
}

function normalizeNumber(value) {
  return normalizeCompact(value).replace(/[,，]/g, '').replace(/^\./, '0.').replace(/^-\./, '-0.')
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function removeRepeatedSection(code, title) {
  const normalized = normalizeText(title)
  const repeated = `${code} `
  const index = normalized.indexOf(repeated)
  return index === -1 ? normalized : normalized.slice(0, index).trim()
}

function uniqueText(values) {
  const result = []
  for (const value of values.map(normalizeText).filter(Boolean)) {
    if (result[result.length - 1] !== value) result.push(value)
  }
  return result
}

export function uniqueWarnings(warnings) {
  const seen = new Set()
  return warnings.filter((warning) => {
    const quotaCodes = [...(warning.quotaCodes ?? [])].sort().join(',')
    const key = `${warning.page ?? ''}\u0000${quotaCodes}\u0000${warning.code}\u0000${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeContinuationItems(items) {
  const merged = new Map()
  for (const item of items) {
    const current = merged.get(item.quotaCode)
    if (!current) {
      merged.set(item.quotaCode, item)
      continue
    }
    const warnings = [...current.warnings, ...item.warnings]
    if (current.quotaName !== item.quotaName && !item.quotaName.startsWith('定额子目 ')) {
      warnings.push(tableWarning(
        'continuation_name_mismatch',
        item.sourcePages[0],
        [item.quotaCode],
        `Continuation item name differs: "${current.quotaName}" versus "${item.quotaName}".`
      ))
    }
    if (current.quotaUnit !== item.quotaUnit && item.quotaUnit !== '未识别') {
      warnings.push(tableWarning(
        'continuation_unit_mismatch',
        item.sourcePages[0],
        [item.quotaCode],
        `Continuation item unit differs: "${current.quotaUnit}" versus "${item.quotaUnit}".`
      ))
    }
    const resources = mergeResources(current.resources, item.resources, warnings, item)
    const workContents = uniqueText([...current.workContents, ...item.workContents].filter((value) => normalizeCompact(value) !== '续前'))
    const quotaName = current.quotaName.startsWith('定额子目 ') ? item.quotaName : current.quotaName
    const quotaUnit = current.quotaUnit === '未识别' ? item.quotaUnit : current.quotaUnit
    const next = {
      ...current,
      quotaName,
      quotaUnit,
      workContents,
      resources,
      adjustments: uniqueText([...current.adjustments, ...item.adjustments]),
      sourcePages: [...new Set([...current.sourcePages, ...item.sourcePages])].sort((left, right) => left - right),
      printedPages: uniqueText([...current.printedPages, ...item.printedPages]),
      sourceExcerpt: `${current.sourceExcerpt}\n\n--- 续页 ---\n${item.sourceExcerpt}`.slice(0, 20_000),
      warnings: revalidateItemWarnings({ quotaName, quotaUnit, workContents, resources }, warnings)
    }
    merged.set(item.quotaCode, next)
  }
  return [...merged.values()].sort((left, right) => left.sourcePages[0] - right.sourcePages[0] || quotaCodeRank(left.quotaCode) - quotaCodeRank(right.quotaCode))
}

function mergeResources(current, continuation, warnings, item) {
  const result = [...current]
  for (const resource of continuation) {
    const exact = result.find((candidate) =>
      candidate.category === resource.category && candidate.code === resource.code &&
      candidate.unit === resource.unit && candidate.consumption === resource.consumption
    )
    if (exact) continue
    const conflict = result.find((candidate) => candidate.code === resource.code && candidate.unit === resource.unit)
    if (conflict) {
      warnings.push(tableWarning(
        'continuation_resource_conflict',
        item.sourcePages[0],
        [item.quotaCode],
        `Resource ${resource.code} has conflicting consumption ${conflict.consumption} and ${resource.consumption}.`
      ))
      continue
    }
    result.push(resource)
  }
  return result
}

function revalidateItemWarnings(item, warnings) {
  return uniqueWarnings(warnings.filter((warning) => {
    if (warning.code === 'missing_item_name') return item.quotaName.startsWith('定额子目 ')
    if (warning.code === 'missing_quota_unit') return !item.quotaUnit || item.quotaUnit === '未识别' || item.quotaUnit === '见表'
    if (warning.code === 'missing_resources') return !item.resources.length
    if (warning.code === 'missing_work_content') return !item.workContents.length
    if (warning.code === 'unknown_resource_category') return item.resources.some((resource) => resource.category === '未分类')
    return true
  }))
}

function quotaCodeRank(code) {
  const [chapter, item] = code.split('-').map(Number)
  return chapter * 100_000 + item
}

function tableWarning(code, page, quotaCodes, message) {
  return { code, page, quotaCodes, message }
}

function normalizePageRange(pageRange, pageCount) {
  const start = Math.max(1, Math.min(pageCount, Math.floor(pageRange?.start ?? 1)))
  const end = Math.max(start, Math.min(pageCount, Math.floor(pageRange?.end ?? pageCount)))
  return { start, end }
}

function duplicateValues(values) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function differences(values) {
  return values.slice(1).map((value, index) => value - values[index])
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function round(value) {
  return Math.round(value * 100) / 100
}
