import { BusinessError, type Catalog, type ProposalLine } from './contracts.js'
import { gradeFromEvidence, normalizeSpecification, sourceCategories, type UiCategory } from './business-rules.js'

const quantityPattern = /([\p{N}.,，．+\-−–—－＋/／~～至到或eExX×*_%％零〇一二三四五六七八九十百千万两半][\p{N}\s.,，．+\-−–—－＋/／~～至到或eExX×*_%％零〇一二三四五六七八九十百千万两半]*)\s*(箱|件)/gu
const cleanName = (text: string) => text.replace(/\s+/gu, '').toLowerCase()
const canonicalName = (text: string) => cleanName(text) === '弯头' ? '90°弯头' : cleanName(text)
const quantityColumn = /^(箱数|数量(?:[（(]箱[）)])?)$/u
const productColumn = /^(品名|产品名称|产品)$/u
const wholeQuantity = (value: string) => /^[1-9]\d*$/u.test(value) && Number(value) <= 1_000_000

function textQuantities(text: string) {
  const matches = [...text.matchAll(quantityPattern)]
  let previousEnd = 0
  let gradeEvidence = ''
  for (const match of matches) {
    const prefix = text.slice(previousEnd, match.index).trim()
    const fields = /^(?:(?:等级|档位|袋色)\s*[:：=]?\s*)?([A-Za-z]+(?:档)?|\p{Script=Han}+袋|黑|蓝|中|好|[（(][A-Za-z]+[）)])?\s*[,，]?\s*(?:(?:数量|箱数)\s*[:：=]?\s*)?$/u.exec(prefix)
    // Only grade and quantity labels may precede a complete count, never notes or an expression fragment.
    if (!wholeQuantity(match[1].trim()) || !fields) return { quantities: [], gradeEvidence: '' }
    gradeEvidence = fields[1] ?? gradeEvidence
    previousEnd = match.index + match[0].length
    if (/^\s*半/u.test(text.slice(previousEnd))) return { quantities: [], gradeEvidence: '' }
  }
  return { quantities: matches.map((match) => Number(match[1])), gradeEvidence }
}

function textFields(text: string) {
  const body = text.replace(/^(?:玛钢|沟槽|球铁|球热|QT)\s+/iu, '')
  const product = /^([^\s,，:：|]+)[\s,，:：|]*/u.exec(body)
  const remaining = body.slice(product?.[0].length ?? 0)
  // A distinct specification field keeps its digits out of quantity parsing.
  const spec = /^(?:规格\s*[:：]?\s*)?([\da-zA-Z./]+(?:\s*[×*xX-]\s*[\da-zA-Z./]+)*)(?:\s+|[:：，]|,(?!\d))/u.exec(remaining)
  const rest = spec ? remaining.slice(spec[0].length) : remaining
  return { productEvidence: product?.[1] ?? '',
    specificationEvidence: spec && !/(?:^|[\s,，。.:：（(箱件])规格/u.test(rest) ? spec[1] : '', ...textQuantities(rest) }
}

type TableDelimiter = '\t' | '|' | 'spaces'
function tableCells(raw: string, delimiter: TableDelimiter): string[] {
  if (delimiter === 'spaces') return raw.trim().split(/\s+/u)
  const text = delimiter === '|' ? raw.trim().replace(/^\|/u, '').replace(/\|$/u, '') : raw
  return text.split(delimiter).map((cell) => cell.trim())
}

// Regular text/OCR rows retain order; multi-column images must be rejected by OCR.
export function sourceRows(inquiry: string) {
  let category: UiCategory = '玛钢'
  let contextGrade = ''
  let columns: string[] = []
  let delimiter: TableDelimiter = 'spaces'
  const separated = inquiry.split('\n').flatMap((raw) => /[\t|]/u.test(raw) ? [raw] :
    raw.replace(/(\d+\s*(?:箱|件)(?:\s*(?:黑袋?|蓝袋?|[aAbB]|中|好))?)\s*[,，]\s*(?=[^\d\s])/gu, '$1\n').split(/[\n;；]+/u))
  return separated.flatMap((raw) => {
    let text = raw.trim()
    if (!text) return []
    if (/^L\s*中\s*[:：=]/iu.test(text)) {
      contextGrade = '中'
      text = text.replace(/^L\s*中\s*[:：=]\s*/iu, '')
      if (!text) return []
    }
    if (/^(球铁|球热|QT|沟槽|玛钢)\s*[:：]?$/iu.test(text)) {
      category = /球铁|球热|QT/iu.test(text) ? '球铁' : text.includes('沟槽') ? '沟槽' : '玛钢'
      return []
    }
    const detected = raw.includes('\t') ? '\t' : raw.includes('|') ? '|' : 'spaces'
    const header = tableCells(raw, detected)
    if (header.some((cell) => productColumn.test(cell)) && header.includes('规格') &&
        header.some((cell) => quantityColumn.test(cell))) {
      columns = header
      delimiter = detected
      return []
    }
    const cells = tableCells(raw, delimiter)
    const quantityIndex = columns.findIndex((cell) => quantityColumn.test(cell))
    const productIndex = columns.findIndex((cell) => productColumn.test(cell))
    const unitIndex = columns.indexOf('单位')
    const gradeIndex = columns.findIndex((cell) => /^(等级|袋色|档位)$/u.test(cell))
    const specIndex = columns.indexOf('规格')
    const factColumns = columns.filter((cell) => /^(规格|单位|等级|袋色|档位)$/u.test(cell))
      .map((cell) => /^(等级|袋色|档位)$/u.test(cell) ? '等级' : cell)
    const unit = cells[unitIndex] ?? ''
    const count = /^([1-9]\d*)\s*(箱|件)?$/u.exec(cells[quantityIndex] ?? '')
    const tableQuantity = columns.length && cells.length === columns.length &&
      columns.filter((cell) => quantityColumn.test(cell)).length === 1 && count && wholeQuantity(count[1]) &&
      columns.filter((cell) => productColumn.test(cell)).length === 1 &&
      new Set(factColumns).size === factColumns.length &&
      (!unit || /^(箱|件)$/u.test(unit)) && (columns[quantityIndex].includes('箱') || !!unit || !!count[2])
      ? Number(count[1]) : null
    return [{ text, category, contextGrade, tableQuantity, isTable: !!columns.length,
      ...(columns.length ? {
        gradeEvidence: gradeIndex >= 0 ? cells[gradeIndex] ?? '' : '',
        quantities: tableQuantity === null ? [] : [tableQuantity], productEvidence: cells[productIndex] ?? '',
        specificationEvidence: cells[specIndex] ?? ''
      } : textFields(text)) }]
  })
}

export function validateProposal(lines: ProposalLine[], catalog: Catalog, inquiry: string) {
  const rows = sourceRows(inquiry)
  const allowed = sourceCategories(inquiry)
  for (const line of lines) {
    if (!inquiry.includes(line.evidence) || !allowed.includes(line.category)) throw new BusinessError('invalid_proposal')
    const row = rows.find((entry) => entry.text === line.evidence.trim())
    if (!row) throw new BusinessError('incomplete_coverage')
    if (rows.some((entry) => entry.text === row.text && JSON.stringify(entry) !== JSON.stringify(row))) throw new BusinessError('invalid_proposal')
    const category = /球铁|球热|\bQT\b/iu.test(row.text) ? '球铁' : row.text.includes('沟槽') ? '沟槽' : row.category
    if (row.text.includes('沟槽') && /球铁|球热|\bQT\b/iu.test(row.text)) throw new BusinessError('invalid_proposal')
    if (category !== line.category) throw new BusinessError('invalid_proposal')
    const quantities = row.quantities
    if (!quantities.length) throw new BusinessError('invalid_proposal')
    if (quantities.length > 1) throw new BusinessError('incomplete_coverage')
    if (!quantities.includes(line.quantityCartons)) throw new BusinessError('invalid_proposal')
    if (line.gradeRaw && !row.text.includes(line.gradeRaw)) throw new BusinessError('invalid_proposal')
    const scopedNames = catalog.products.filter((product) => product.category === category).flatMap((product) =>
      [product.productName, ...product.aliases, ...(product.productName === '90°弯头' ? ['弯头'] : [])])
    let productText = row.productEvidence
    if (!scopedNames.some((name) => canonicalName(name) === canonicalName(productText)) && productText.startsWith(category)) {
      const unprefixed = productText.slice(category.length)
      if (scopedNames.some((name) => canonicalName(name) === canonicalName(unprefixed))) productText = unprefixed
    }
    const exactProduct = scopedNames.some((name) => cleanName(name) === cleanName(productText))
    const sourceProducts = catalog.products.filter((product) => product.category === category &&
      [product.productName, ...product.aliases].some((name) => canonicalName(name) === canonicalName(productText)))
    if (sourceProducts.length && !sourceProducts.some((product) =>
      [product.productName, ...product.aliases].some((name) => canonicalName(name) === canonicalName(line.productName)))) throw new BusinessError('invalid_proposal')
    const compactBags = exactProduct ? [] : scopedNames.flatMap((name) => {
      const normalized = cleanName(productText)
      const product = cleanName(name)
      return [normalized.startsWith(product) ? normalized.slice(product.length) : '',
        normalized.endsWith(product) ? normalized.slice(0, -product.length) : ''].filter((part) => /^\p{Script=Han}+袋$/u.test(part))
    })
    // Do not interpret characters inside an exact master-data product name as grades.
    const gradeSource = row.isTable ? row.gradeEvidence : exactProduct || compactBags.length ? row.text.replace(productText, ' ') : row.text
    // Explicit grade fields and standalone tokens cannot be hidden behind default b.
    const explicit = [...gradeSource.matchAll(/(?:等级|档位|袋色)\s*[:：=]?\s*([^\s,，;；|。]+)/gu)].map((match) => match[1])
    const tokens = [...gradeSource.matchAll(/(?:^|[\s,，。.:：|]|箱|件)([aAbB]|黑袋?|蓝袋?|中|好)(?=$|[\s,，。.:：|])/gu)].map((match) => match[1])
    const beforeQuantity = [...gradeSource.matchAll(/(?:^|[\s,，|])(黑袋?|蓝袋?|[A-Za-z]+|中|好)(?=\s*[1-9]\d*\s*(?:箱|件))/gu)].map((match) => match[1])
    const afterQuantity = [...gradeSource.matchAll(/(?:箱|件)[\s,，。.:：|]*([A-Za-z]+)(?=$|[\s,，。.:：|])/gu)].map((match) => match[1])
    const decorated = [...gradeSource.matchAll(/(?:^|[\s,，。|]|箱|件)([A-Za-z]+档|[（(][A-Za-z]+[）)])(?=$|[\s,，。|]|\d)/gu)].map((match) => match[1])
    const gradeText = (row.isTable ? gradeSource : gradeSource.replace(/[1-9]\d*\s*(?:箱|件)/gu, ' '))
      .replace(/(?:等级|档位|袋色)\s*[:：=]?\s*/gu, ' ')
    const bags = [...gradeText.matchAll(/(?:^|[\s,，。.:：|])([^\s,，。.:：|]+袋)(?=$|[\s,，。.:：|]|\d)/gu)].map((match) => match[1])
    const trailing = !explicit.length && !row.isTable ? /(?:箱|件)\s*([^\s,，。.;；|]+)\s*[。.]?$/u.exec(gradeSource)?.[1] : undefined
    const rawTokens = [...explicit, ...tokens, ...beforeQuantity, ...afterQuantity, ...decorated, ...bags, ...compactBags, ...(trailing ? [trailing] : []), ...(row.gradeEvidence ? [row.gradeEvidence] : [])]
    if (line.gradeRaw && !rawTokens.includes(line.gradeRaw)) throw new BusinessError('invalid_grade')
    const grades = rawTokens.map((raw) => gradeFromEvidence(raw, row.contextGrade))
    const result = gradeFromEvidence(line.gradeRaw, row.contextGrade)
    if (result.reviewRequired || result.priceMarker !== line.priceMarker || grades.some((grade) => grade.reviewRequired || grade.priceMarker !== line.priceMarker)) {
      throw new BusinessError('invalid_grade')
    }
    if (rawTokens.length && !line.gradeRaw) throw new BusinessError('invalid_grade')
    if (normalizeSpecification(row.specificationEvidence) !== normalizeSpecification(line.specification)) throw new BusinessError('invalid_proposal')
    const sourceName = cleanName(productText)
    const selected = canonicalName(line.productName)
    const sourceAngle = /(\d+)(?:°|度)弯头/u.exec(sourceName)?.[1]
    const selectedAngle = /(\d+)(?:°|度)弯头/u.exec(selected)?.[1]
    if (sourceAngle && sourceAngle !== selectedAngle) throw new BusinessError('invalid_proposal')
    const candidates = catalog.products.filter((product) => product.category === line.category &&
      [product.productName, ...product.aliases].some((name) => canonicalName(name) === selected))
    const names = candidates.flatMap((product) => [product.productName, ...product.aliases,
      ...(product.productName === '90°弯头' ? ['弯头'] : [])])
    const withoutBag = compactBags.length ? sourceName.replace(compactBags[0], '') : sourceName
    if (!names.some((name) => canonicalName(withoutBag) === canonicalName(name))) {
      const compatible = candidates.filter((product) => product.priceMarker === line.priceMarker &&
        normalizeSpecification(product.specification) === normalizeSpecification(line.specification))
      // Retain the existing OCR correction case, never infer new aliases from a free-form reason.
      if (sourceProducts.length || sourceName !== '三涌' || selected !== '三通' || !line.correctionReason?.trim() || compatible.length !== 1) {
        throw new BusinessError('invalid_proposal')
      }
    }
  }
  for (const row of rows.filter((entry, index) => rows.findIndex((other) => other.text === entry.text) === index)) {
    const matched = lines.filter((line) => line.evidence.trim() === row.text)
    // Only deterministic section/table headings are non-product rows. Everything else must be covered.
    if (!matched.length && /^(?:(?:合成|演示)?询价(?:单)?|产品(?:名称)?[\s|,，]+规格[\s|,，]+(?:数量|箱数)(?:[\s|,，]+等级)?)$/u.test(row.text)) continue
    const quantities = rows.filter((entry) => entry.text === row.text).flatMap((entry) => entry.quantities).sort((a, b) => a - b)
    const proposed = matched.map((line) => line.quantityCartons).sort((a, b) => a - b)
    if (!quantities.length || JSON.stringify(quantities) !== JSON.stringify(proposed)) throw new BusinessError('incomplete_coverage')
  }
}
