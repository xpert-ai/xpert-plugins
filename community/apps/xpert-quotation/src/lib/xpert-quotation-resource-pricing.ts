import { createHash } from 'node:crypto'
import type {
  KnowledgePriceCandidate,
  PricingFeeBase,
  PricingFeeRuleInput,
  QuotaBreakdownProposal,
  QuotaPricingFormulaRule,
  QuotaPricingResource,
  QuotaResourcePriceState,
  QuotationLinePricingCalculation,
  ResourceCategory,
  ResourcePriceCandidate,
  ResourcePriceItem
} from './types.js'

export const XPERT_QUOTATION_PRICING_ENGINE_VERSION = '1.1.0'
export const MAX_RESOURCE_PRICE_CANDIDATES = 5

function resourceSearchDescriptor(resource: Pick<QuotaPricingResource, 'quotaName' | 'name'>) {
  const quotaName = resource.quotaName?.trim()
  const name = resource.name.trim()
  if (!quotaName) return name
  if (!name) return quotaName
  return name.startsWith(`${quotaName} `) || name === quotaName ? name : `${quotaName} ${name}`
}

export function extractQuotaPricingResources(proposal: QuotaBreakdownProposal): QuotaPricingResource[] {
  const resources: QuotaPricingResource[] = []
  for (const component of proposal.components) {
    for (let index = 0; index < component.resources.length; index += 1) {
      const resource = component.resources[index]
      resources.push({
        id: quotaResourceId(component.candidateId, resource.code, resource.name, resource.unit, index),
        componentCandidateId: component.candidateId,
        ...(component.quotaCode ? { quotaCode: component.quotaCode } : {}),
        ...(component.quotaName ? { quotaName: component.quotaName } : {}),
        quotaUnit: component.quotaUnit ?? '',
        category: resource.category,
        code: resource.code,
        name: resource.name,
        aliases: quotaResourceAliases(resource.name, resource.category),
        unit: resource.unit,
        consumption: resource.consumption,
        ...(resource.consumptionPending ? { consumptionPending: true } : {})
      })
    }
  }
  return resources
}

export function initializeQuotaResourcePrices(resources: QuotaPricingResource[]): QuotaResourcePriceState[] {
  return resources.map((resource) => ({
    resourceId: resource.id,
    status: 'not_searched',
    candidates: []
  }))
}

export function initializeQuotaPricingFormulaRules(
  components: QuotaBreakdownProposal['components']
): QuotaPricingFormulaRule[] {
  return components.flatMap((component) => {
    const sourceFormulas = component.formulas?.length ? component.formulas : [undefined]
    return sourceFormulas.map((sourceText, index) => {
      const id = `formula_${createHash('sha256')
        .update([component.candidateId, sourceText ?? 'no-source-formula', index].join('\u0000'))
        .digest('hex')
        .slice(0, 24)}`
      return {
        id,
        componentCandidateId: component.candidateId,
        code: id,
        name: sourceText?.trim() || `${component.quotaCode ?? component.quotaName ?? '消耗量'}计价调整`,
        ratePercent: '0',
        base: 'direct_cost' as const,
        status: 'skipped' as const,
        ...(sourceText?.trim() ? { sourceText: sourceText.trim() } : {})
      }
    })
  })
}

export function resolvedQuotaPricingFormulaRules(proposal: QuotaBreakdownProposal) {
  const initialized = initializeQuotaPricingFormulaRules(proposal.components)
  const currentById = new Map((proposal.pricingFormulaRules ?? []).map((rule) => [rule.id, rule]))
  const available = [...(proposal.pricingFormulaRules ?? [])]
  return initialized.map((rule) => {
    const exact = currentById.get(rule.id)
    if (exact) return exact
    const semanticIndex = available.findIndex((current) =>
      current.componentCandidateId === rule.componentCandidateId &&
      (current.sourceText ?? '') === (rule.sourceText ?? '')
    )
    if (semanticIndex < 0) return rule
    const [semantic] = available.splice(semanticIndex, 1)
    return semantic
  })
}

export function effectiveUncoveredWorkScopes(proposal: QuotaBreakdownProposal) {
  const skipped = new Set(proposal.skippedUncoveredWorkScopes ?? [])
  return proposal.uncoveredWorkScopes.filter((scope) => !skipped.has(scope))
}

export function reconcileQuotaResourcePrices(
  previousResources: QuotaPricingResource[],
  previousStates: QuotaResourcePriceState[],
  nextResources: QuotaPricingResource[]
): QuotaResourcePriceState[] {
  const previousResourceById = new Map(previousResources.map((resource) => [resource.id, resource]))
  const previousStateById = new Map(previousStates.map((state) => [state.resourceId, state]))
  const exactIds = new Set(nextResources.map((resource) => resource.id).filter((id) => previousResourceById.has(id)))
  const availableByIdentity = new Map<string, QuotaPricingResource[]>()

  for (const resource of previousResources) {
    if (exactIds.has(resource.id) || !previousStateById.has(resource.id)) continue
    const key = quotaResourcePriceIdentity(resource)
    const available = availableByIdentity.get(key) ?? []
    available.push(resource)
    availableByIdentity.set(key, available)
  }

  return nextResources.map((resource) => {
    const exact = previousStateById.get(resource.id)
    if (exact) return exact

    const available = availableByIdentity.get(quotaResourcePriceIdentity(resource))
    const previousResource = available?.shift()
    const previous = previousResource ? previousStateById.get(previousResource.id) : undefined
    return previous
      ? { ...previous, resourceId: resource.id }
      : { resourceId: resource.id, status: 'not_searched', candidates: [] }
  })
}

function quotaResourcePriceIdentity(resource: QuotaPricingResource) {
  return [
    resource.category,
    resource.code.trim().toLowerCase(),
    normalizeName(resource.name),
    normalizeResourceUnit(resource.unit)
  ].join('\u0000')
}

export function buildResourcePriceQuery(
  resource: QuotaPricingResource,
  context: { region?: string | null; pricePeriod?: string | null } = {}
) {
  const priceDocumentHints = resource.category === '人工'
    ? [
      '价格字段：日工资、人工单价、元/工日',
      '资料类型：建筑工种劳务市场人工信息价格',
      '常用人工候选：普工、建筑工、一般技工、木工、模板工、抹灰工、钢筋工、混凝土工、架子工、砌筑工'
    ]
    : resource.category === '机械'
      ? ['价格字段：台班单价、机械租赁价格', '资料类型：机械租赁信息价格']
      : resource.category === '材料'
        ? ['价格字段：税前综合价格、材料单价', '资料类型：建设工程材料市场信息价格']
        : ['价格字段：单价、价格']
  const projectDescriptor = resourceSearchDescriptor(resource)
  return [
    '知识类型：人工、材料或机械资源价格（不是消耗量定额、不是人工工日消耗量）',
    `资源类别：${resourceCategoryLabel(resource.category)}`,
    `资源编码：${resource.code}`,
    `项目名称/资源名称：${projectDescriptor}`,
    ...(resource.aliases.length ? [`资源别名：${resource.aliases.join('、')}`] : []),
    `资源计价单位：${resource.unit}`,
    `检索关键词：${projectDescriptor} ${resource.aliases.join(' ')} 元 价格`,
    ...priceDocumentHints,
    ...(context.region?.trim() ? [`价格地区：${context.region.trim()}`] : []),
    ...(context.pricePeriod?.trim() ? [`价格期：${context.pricePeriod.trim()}`] : [])
  ].join('\n')
}

/** A second retrieval pass is useful when a knowledgebase contains both the
 * quota book and the price book and hybrid retrieval ranks the quota book
 * first. It remains resource-specific and never falls back to bill text. */
export function buildResourcePriceFallbackQuery(resource: QuotaPricingResource, context: { region?: string | null; pricePeriod?: string | null } = {}) {
  const aliases = resource.aliases.length ? resource.aliases.join('、') : resource.name
  const source = resource.category === '人工'
    ? '建筑工种劳务市场人工信息价格 日工资 元 工日 普工 建筑工 一般技工'
    : resource.category === '机械'
      ? '机械租赁信息价格 台班 单价'
      : resource.category === '材料'
        ? '建设工程材料市场信息价格 税前综合价格 单价 规格'
        : '工程资源价格 单价'
  return [
    source,
    `项目名称/资源：${resourceSearchDescriptor(resource)}`,
    `别名：${aliases}`,
    `单位：${resource.unit}`,
    `关键词：${[resourceSearchDescriptor(resource), ...resource.aliases].filter(Boolean).join(' ')} 元 价格`,
    ...(context.region?.trim() ? [`地区：${context.region.trim()}`] : []),
    ...(context.pricePeriod?.trim() ? [`价格期：${context.pricePeriod.trim()}`] : [])
  ].join('；')
}

export function buildResourcePriceSectionQuery(
  resource: QuotaPricingResource,
  context: { region?: string | null; pricePeriod?: string | null } = {}
) {
  const section = resource.category === '人工'
    ? '南京市建筑工种劳务市场人工信息价格 序号 名称 单位 日工资（元） 日工资按照小时计算'
    : resource.category === '机械'
      ? '南京市机械租赁信息价格 序号 名称及规格 单位 台班 税前综合价格（元）'
      : resource.category === '材料'
        ? '南京市建设工程材料市场信息价格 序号 名称及规格 单位 税前综合价格（元）'
        : '工程资源价格 序号 名称 单位 单价'
  return [
    section,
    `项目名称及规格：${resourceSearchDescriptor(resource)}`,
    ...(resource.aliases.length ? [`别名：${resource.aliases.join('、')}`] : []),
    `单位：${resource.unit}`,
    `检索关键词：${[resourceSearchDescriptor(resource), ...resource.aliases].filter(Boolean).join(' ')} 元 价格`,
    ...(context.region?.trim() ? [`地区：${context.region.trim()}`] : []),
    ...(context.pricePeriod?.trim() ? [`价格期：${context.pricePeriod.trim()}`] : [])
  ].join('\n')
}

/** A deliberately narrow final query for long price books whose embedding is
 * dominated by an earlier material or machine table. The service uses this
 * only after the normal resource searches produce no structured match. */
export function buildResourcePriceDeepQuery(
  resource: QuotaPricingResource,
  context: { region?: string | null; pricePeriod?: string | null } = {}
) {
  const exactNames = [resourceSearchDescriptor(resource), ...resource.aliases].filter(Boolean).join(' | ')
  const priceFields = resource.category === '人工'
    ? '建筑工种劳务市场人工信息价格 日工资(元) 注:日工资按照小时计算'
    : resource.category === '机械'
      ? '机械租赁信息价格 台班 税前综合价格(元)'
      : resource.category === '材料'
        ? '建设工程材料市场信息价格 名称及规格 单位 税前综合价格(元)'
        : '工程资源价格 单价'
  return [
    exactNames,
    priceFields,
    `检索关键词 ${[resourceSearchDescriptor(resource), ...resource.aliases].filter(Boolean).join(' ')} 元 价格`,
    `单位 ${resource.unit}`,
    context.region?.trim(),
    context.pricePeriod?.trim()
  ].filter(Boolean).join('；')
}

export function rankResourcePriceCandidates(
  candidates: KnowledgePriceCandidate[],
  resource: QuotaPricingResource
): ResourcePriceCandidate[] {
  const ranked = candidates.map((candidate) => {
    const matches = candidate.priceItems
      .map((item) => ({ item, score: resourcePriceItemScore(resource, item) }))
      .filter((entry) => entry.score > 0 && entry.item.id)
      .sort((left, right) => right.score - left.score)
    // Machine and labor books usually contain several nearby variants. Keep
    // every same-category structured option in the review snapshot so a human
    // can choose the exact capacity/trade instead of silently hiding it.
    const familyMatches = candidate.priceItems
      .filter((item) => (resource.category === '机械'
        ? item.resourceCategory === 'machine' || normalizeResourceUnit(item.unit) === '台班'
        : item.resourceCategory === 'labor'))
      .filter((item) => item.id)
      .map((item) => ({ item, score: 20 }))
    const visibleMatches = resource.category === '机械' || resource.category === '人工'
      ? [...matches, ...familyMatches.filter(({ item }) => !matches.some((entry) => entry.item.id === item.id))]
      : matches
    return {
      ...candidate,
      resourceMatchScore: visibleMatches[0]?.score ?? 0,
      matchedPriceItemIds: visibleMatches.map((entry) => entry.item.id!).slice(0, MAX_RESOURCE_PRICE_CANDIDATES)
    }
  }).sort((left, right) =>
    right.resourceMatchScore - left.resourceMatchScore ||
    candidateRetrievalScore(right) - candidateRetrievalScore(left) ||
    left.id.localeCompare(right.id)
  )
  const remaining = MAX_RESOURCE_PRICE_CANDIDATES
  let count = 0
  return ranked.map((candidate) => {
    const matchedPriceItemIds = candidate.matchedPriceItemIds.slice(0, Math.max(0, remaining - count))
    count += matchedPriceItemIds.length
    return { ...candidate, matchedPriceItemIds }
  }).filter((candidate) => candidate.matchedPriceItemIds.length > 0 || candidate.resourceMatchScore === 0)
}

export function findResourcePriceItem(candidate: ResourcePriceCandidate, priceItemId: string) {
  return candidate.priceItems.find((item) => item.id === priceItemId)
}

export function normalizeSelectedResourcePrice(input: {
  resource: QuotaPricingResource
  priceItem: ResourcePriceItem
  quotaWorkdayHours?: number
}) {
  const expectedUnit = normalizeResourceUnit(input.resource.unit)
  const sourceUnit = normalizeResourceUnit(input.priceItem.unit)
  const unresolvedMachineUnit = input.resource.category === '机械' &&
    !unitDefinition(input.resource.unit) && unitDefinition(input.priceItem.unit)?.dimension === 'machine'
  let unitConversion = unresolvedMachineUnit
    ? buildUnitConversion(input.priceItem.unit, input.priceItem.unit)
    : buildUnitConversion(input.priceItem.unit, input.resource.unit)
  let normalized = parseDecimal(input.priceItem.unitPrice)
  if (expectedUnit === '工日' && input.priceItem.workdayHours !== undefined) {
    const quotaHours = input.quotaWorkdayHours
    if (!quotaHours || !Number.isFinite(quotaHours) || quotaHours <= 0 || quotaHours > 24) {
      throw new Error(`Price item uses a ${input.priceItem.workdayHours}-hour workday. Provide the reviewed quota workday-hour basis before conversion.`)
    }
    normalized = divide(
      multiply(normalized, parseDecimal(numberText(quotaHours))),
      parseDecimal(numberText(input.priceItem.workdayHours)),
      12
    )
    unitConversion = {
      sourceUnit: input.priceItem.unit,
      targetUnit: input.resource.unit,
      factor: formatDecimal(divide(parseDecimal(numberText(input.quotaWorkdayHours ?? 0)), parseDecimal(numberText(input.priceItem.workdayHours)), 12), 12, true),
      method: 'workday_hours',
      formula: `${input.priceItem.unitPrice} 元/${input.priceItem.workdayHours}小时工日 × ${input.quotaWorkdayHours}小时 ÷ ${input.priceItem.workdayHours}小时 = ${formatDecimal(normalized, 8, true)} 元/${input.resource.unit}`
    }
  } else if (unitConversion.factor !== '1') {
    normalized = multiply(normalized, parseDecimal(unitConversion.factor))
  }
  return {
    normalizedUnit: unresolvedMachineUnit ? sourceUnit : expectedUnit,
    normalizedUnitPrice: formatDecimal(normalized, 8, true),
    unitConversion,
    ...(unresolvedMachineUnit ? { requiresResourceUnitReview: true } : {})
  }
}

/** Converts a price quoted per source unit into a price per target unit. */
export function convertUnitPrice(unitPrice: string, sourceUnit: string, targetUnit: string) {
  const conversion = buildUnitConversion(sourceUnit, targetUnit)
  if (conversion.factor === '1') return { unitPrice, conversion }
  const value = multiply(parseDecimal(unitPrice), parseDecimal(conversion.factor))
  return {
    unitPrice: formatDecimal(value, 8, true),
    conversion
  }
}

export function buildUnitConversion(sourceUnit: string, targetUnit: string) {
  const source = unitDefinition(sourceUnit)
  const target = unitDefinition(targetUnit)
  if (!source || !target || source.dimension !== target.dimension) {
    throw new Error(`Unit ${sourceUnit} is not compatible with ${targetUnit}.`)
  }
  const factor = divide(target.toBase, source.toBase, 12)
  const factorText = formatDecimal(factor, 12, true)
  return {
    sourceUnit: source.display,
    targetUnit: target.display,
    factor: factorText,
    method: source.dimension === 'workday' ? 'workday_hours' as const : source.dimension === target.dimension && factorText === '1' ? 'identity' as const : 'metric' as const,
    formula: `${source.display} 单价 × ${factorText} = ${target.display} 单价`
  }
}

export function parseUnitBase(value: string) {
  return parseQuotaUnit(value).base
}

export function normalizeResourceUnit(value: string) {
  const normalized = value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
    .replace(/平方米|平方公尺|㎡|m²/g, 'm2')
    .replace(/立方米|立方公尺|m³/g, 'm3')
    .replace(/千克|公斤/g, 'kg')
    .replace(/吨/g, 't')
    .replace(/人日|人工日|日工资/g, '工日')
    .replace(/机械台班/g, '台班')
    .replace(/小时|工时/g, '小时')
  return normalized
}

export function calculateComprehensiveRate(input: {
  proposal: QuotaBreakdownProposal
  resources: QuotaPricingResource[]
  resourcePrices: QuotaResourcePriceState[]
  quantity: string
  billUnit: string
  fees: PricingFeeRuleInput[]
  unitPriceScale?: number
  calculatedAt?: Date
}): QuotationLinePricingCalculation {
  if (input.proposal.mappingStatus === 'rejected') throw new Error('Rejected quota breakdown cannot be calculated.')
  const quantity = parseDecimal(input.quantity)
  if (quantity.integer <= 0n) throw new Error('Bill quantity must be greater than zero.')
  const bill = parseQuotaUnit(input.billUnit)
  const billUnit = bill.unit
  const stateMap = new Map(input.resourcePrices.map((state) => [state.resourceId, state]))
  const selection = selectApprovedPricingResources(input.resources, input.resourcePrices)
  const componentQuotaUnits = new Map(input.proposal.components.map((component) => [component.candidateId, component.quotaUnit]))
  const resourceCosts: QuotationLinePricingCalculation['resourceCosts'] = []
  const calculationWarnings: string[] = []
  const unpricedResourceIds: string[] = []
  const categoryCosts = {
    labor: zero(),
    material: zero(),
    machine: zero()
  }

  for (const category of selection.missingCategories) {
    const categoryResources = input.resources.filter((resource) => normalizedCategory(resource.category) === category)
    calculationWarnings.push(`${pricingCategoryLabel(category)}尚未选择已批准资源，该类别金额按 0 计。`)
    unpricedResourceIds.push(...categoryResources.map((resource) => resource.id))
  }
  for (const category of selection.duplicateCategories) {
    calculationWarnings.push(`${pricingCategoryLabel(category)}存在多个历史批准项，当前仅采用最后批准的一项。`)
  }
  const unclassified = input.resources.filter((resource) => normalizedCategory(resource.category) === 'unclassified')
  if (unclassified.length) {
    calculationWarnings.push('未归类资源不参与综合单价计算。')
    unpricedResourceIds.push(...unclassified.map((resource) => resource.id))
  }

  for (const resource of selection.resources) {
    const state = stateMap.get(resource.id)
    let priceStatus: 'approved' | 'missing' | 'invalid' = 'approved'
    let warning: string | undefined
    let quota: ReturnType<typeof parseQuotaUnit> | undefined
    let quotaUnitConversion: ReturnType<typeof buildUnitConversion> | undefined
    const quotaUnit = resource.quotaUnit.trim() || componentQuotaUnits.get(resource.componentCandidateId)?.trim() || billUnit
    // A missing quantity is a review warning, not a reason to discard the
    // resource. The reviewer explicitly asked for a calculable result even
    // when OCR did not recover the consumption column, so the deterministic
    // fallback is one quota unit.
    let consumption = one()
    let unitPrice = zero()
    try {
      quota = parseQuotaUnit(quotaUnit)
      quotaUnitConversion = buildUnitConversion(quota.unit, billUnit)
      if (resource.consumptionPending || !resource.consumption.trim()) {
        warning = `资源 ${resource.name} 的消耗量待补充，当前按 1 计。`
      } else {
        try {
          consumption = parseDecimal(resource.consumption)
          if (consumption.integer < 0n) throw new Error('consumption cannot be negative')
        } catch {
          consumption = one()
          warning = `资源 ${resource.name} 的消耗量无效，当前按 1 计。`
        }
      }
    } catch {
      priceStatus = 'invalid'
      warning = `资源 ${resource.name} 的消耗量单位或数值无法换算，金额按 0 计。`
    }
    if (priceStatus === 'approved') {
      if (state?.status !== 'approved' || !state.recommendation) {
        priceStatus = 'missing'
        warning = [warning, `资源 ${resource.name} 没有已采用价格，金额按 0 计。`].filter(Boolean).join('；')
      } else if (state.recommendation.requiresResourceUnitReview) {
        priceStatus = 'invalid'
          warning = [warning, `资源 ${resource.name} 的单位需要复核，金额按 0 计。`].filter(Boolean).join('；')
      } else {
        try {
          unitPrice = parseDecimal(state.recommendation.normalizedUnitPrice)
          if (unitPrice.integer < 0n) throw new Error('unit price cannot be negative')
        } catch {
          priceStatus = 'invalid'
          warning = [warning, `资源 ${resource.name} 的价格无效，金额按 0 计。`].filter(Boolean).join('；')
        }
      }
    }
    if (warning) {
      calculationWarnings.push(warning)
      unpricedResourceIds.push(resource.id)
    }
    const costPerQuotaUnit = multiply(consumption, unitPrice)
    const costPerQuotaBaseUnit = quota && quotaUnitConversion ? divide(costPerQuotaUnit, quota.base, 12) : zero()
    const costPerBillUnit = quota && quotaUnitConversion
      ? multiply(multiply(costPerQuotaBaseUnit, parseDecimal(quotaUnitConversion.factor)), bill.base)
      : zero()
    const category = normalizedCategory(resource.category)
    if (category === 'unclassified') {
      calculationWarnings.push(`资源 ${resource.name} 未归类，金额按 0 计。`)
      unpricedResourceIds.push(resource.id)
    } else categoryCosts[category] = add(categoryCosts[category], costPerBillUnit)
    resourceCosts.push({
      resourceId: resource.id,
      ...(resource.quotaCode ? { quotaCode: resource.quotaCode } : {}),
      category: resource.category,
      code: resource.code,
      name: resource.name,
      quotaUnit,
      quotaBase: formatDecimal(quota?.base ?? zero(), 8, true),
      consumption: formatDecimal(consumption, 8, true),
      normalizedUnitPrice: formatDecimal(unitPrice, 8, true),
      costPerQuotaUnit: formatDecimal(costPerQuotaUnit, 8, true),
      costPerBillUnit: formatDecimal(costPerBillUnit, 8, true),
      priceStatus,
      ...(warning ? { warning } : {}),
      ...(state?.recommendation?.unitConversion ? { priceUnitConversion: state.recommendation.unitConversion } : {}),
      ...(quotaUnitConversion && quotaUnitConversion.factor !== '1' ? { quotaUnitConversion } : {})
    })
  }

  const directTotal = add(add(categoryCosts.labor, categoryCosts.material), categoryCosts.machine)
  let runningTotal = directTotal
  if (new Set(input.fees.map((rule) => rule.code)).size !== input.fees.length) throw new Error('Fee rule codes must be unique.')
  const fees = input.fees.map((rule) => {
    const rate = parsePercentage(rule.ratePercent)
    const baseAmount = feeBase(rule.base, categoryCosts, directTotal, runningTotal)
    const amount = divide(multiply(baseAmount, rate), parseDecimal('100'), 12)
    runningTotal = add(runningTotal, amount)
    return {
      ...rule,
      ratePercent: formatDecimal(rate, 8, true),
      baseAmount: formatDecimal(baseAmount, 8, true),
      amount: formatDecimal(amount, 8, true)
    }
  })
  const scale = Math.max(2, Math.min(6, Math.floor(input.unitPriceScale ?? 4)))
  const comprehensiveUnitPrice = formatDecimal(runningTotal, scale, false)
  const totalAmount = formatDecimal(multiply(quantity, parseDecimal(comprehensiveUnitPrice)), 2, false)
  return {
    status: 'calculated',
    engineVersion: XPERT_QUOTATION_PRICING_ENGINE_VERSION,
    quotaBreakdownProposedAt: input.proposal.proposedAt,
    quantity: formatDecimal(quantity, 8, true),
    billUnit,
    resourceCosts,
    directCosts: {
      labor: formatDecimal(categoryCosts.labor, 8, true),
      material: formatDecimal(categoryCosts.material, 8, true),
      machine: formatDecimal(categoryCosts.machine, 8, true),
      total: formatDecimal(directTotal, 8, true)
    },
    fees,
    comprehensiveUnitPrice,
    totalAmount,
    unitPriceScale: scale,
    calculationWarnings: [...new Set(calculationWarnings)],
    unpricedResourceIds: [...new Set(unpricedResourceIds)],
    calculatedAt: (input.calculatedAt ?? new Date()).toISOString()
  }
}

export function selectApprovedPricingResources(
  resources: QuotaPricingResource[],
  resourcePrices: QuotaResourcePriceState[]
) {
  const states = new Map(resourcePrices.map((state) => [state.resourceId, state]))
  const selected: QuotaPricingResource[] = []
  const missingCategories: Array<'labor' | 'material' | 'machine'> = []
  const duplicateCategories: Array<'labor' | 'material' | 'machine'> = []

  for (const category of ['labor', 'machine', 'material'] as const) {
    const categoryResources = resources.filter((resource) => normalizedCategory(resource.category) === category)
    if (!categoryResources.length) continue
    const approved = categoryResources
      .map((resource, index) => ({ resource, state: states.get(resource.id), index }))
      .filter((item) => item.state?.status === 'approved' && Boolean(item.state.recommendation))
      .sort((left, right) =>
        resourceSelectionTime(right.state) - resourceSelectionTime(left.state) ||
        right.index - left.index
      )
    if (!approved.length) {
      missingCategories.push(category)
      continue
    }
    selected.push(approved[0].resource)
    if (approved.length > 1) duplicateCategories.push(category)
  }

  return { resources: selected, missingCategories, duplicateCategories }
}

function resourceSelectionTime(state?: QuotaResourcePriceState) {
  const timestamp = state?.reviewedAt ?? state?.recommendation?.recommendedAt
  const value = timestamp ? Date.parse(timestamp) : 0
  return Number.isFinite(value) ? value : 0
}

function pricingCategoryLabel(category: 'labor' | 'material' | 'machine') {
  if (category === 'labor') return '人工'
  if (category === 'machine') return '机械'
  return '材料'
}

function quotaResourceId(candidateId: string, code: string, name: string, unit: string, position: number) {
  return `resource_${createHash('sha256').update([candidateId, code, name, unit, position].join('\u0000')).digest('hex').slice(0, 32)}`
}

function quotaResourceAliases(name: string, category: QuotaPricingResource['category']) {
  const normalized = normalizeName(name)
  const aliases = new Set<string>()
  if (category === '人工') {
    if (/普工/.test(normalized)) aliases.add('建筑、装饰工程普工')
    if (/一般技工/.test(normalized)) {
      aliases.add('一般技工')
      aliases.add('建筑工')
      aliases.add('建筑、装饰工程人工')
      aliases.add('木工')
      aliases.add('模板工')
      aliases.add('钢筋工')
      aliases.add('混凝土工')
      aliases.add('抹灰工')
      aliases.add('砌筑工')
      aliases.add('架子工')
    }
    if (/高级技工/.test(normalized)) {
      aliases.add('高级技工')
      aliases.add('建筑工')
      aliases.add('木工')
      aliases.add('钢筋工')
      aliases.add('混凝土工')
      aliases.add('抹灰工')
    }
    if (/木工|模板工/.test(normalized)) aliases.add('木工（模板工）')
    if (/抹灰工/.test(normalized)) aliases.add('抹灰工（一般抹灰）')
    if (/挖土|清底|修坡|搬运|装卸/.test(normalized)) {
      aliases.add('普工')
      aliases.add('建筑、装饰工程普工')
    }
  } else if (category === '材料') {
    if (/^(?:施工用)?水$/.test(normalized)) {
      aliases.add('自来水')
      aliases.add('施工用水')
    }
    if (/黄砂|砂石|砂/.test(normalized)) {
      aliases.add('粗砂')
      aliases.add('中砂')
      aliases.add('细砂')
      aliases.add('机制砂')
    }
    if (/碎石|石子|级配/.test(normalized)) {
      aliases.add('碎石5-40mm')
      aliases.add('碎石5-31.5mm')
      aliases.add('碎石5-20mm')
      aliases.add('道渣40-80mm')
    }
  } else if (category === '机械') {
    const compact = normalized.replace(/[·。.]/g, '')
    if (/电动夯实机|夯实机.*电动/.test(compact)) {
      aliases.add('夯实机(电动)')
      aliases.add('夯实机')
    }
    if (/内燃夯实机|夯实机.*内燃/.test(compact)) {
      aliases.add('夯实机(内燃)')
      aliases.add('夯实机')
    }
    if (/推土机/.test(compact)) aliases.add(compact.replace(/功率/g, ''))
    if (/挖掘机/.test(compact)) aliases.add(compact.replace(/斗容量/g, ''))
    if (/压路机/.test(compact)) aliases.add(compact.replace(/工作质量/g, ''))
    if (/自卸汽车|载重汽车/.test(compact)) aliases.add(compact.replace(/装载质量/g, ''))
  }
  aliases.delete(name)
  return [...aliases]
}

function resourcePriceItemScore(resource: QuotaPricingResource, item: ResourcePriceItem) {
  if (!item.id) return 0
  const expectedCategory = normalizedCategory(resource.category)
  if (item.resourceCategory && item.resourceCategory !== 'unclassified' && item.resourceCategory !== expectedCategory) return 0
  const sameMachineFamily = expectedCategory === 'machine' &&
    item.resourceCategory === 'machine' &&
    machineFamily(resource.name) !== undefined &&
    machineFamily(resource.name) === machineFamily(item.name)
  try {
    buildUnitConversion(item.unit, resource.unit)
  } catch {
    if (!(sameMachineFamily && !unitDefinition(resource.unit) && unitDefinition(item.unit)?.dimension === 'machine')) return 0
  }
  const resourceNames = new Set([resource.name, ...resource.aliases].map(normalizeName))
  const itemNames = new Set([item.name, ...(item.aliases ?? [])].map(normalizeName))
  let nameScore = 0
  for (const name of resourceNames) {
    if (itemNames.has(name)) nameScore = Math.max(nameScore, 100)
    for (const candidate of itemNames) {
      if (name.length >= 2 && candidate.length >= 2 && (name.includes(candidate) || candidate.includes(name))) {
        nameScore = Math.max(nameScore, 70)
      }
    }
  }
  const codeScore = item.code && normalizeName(item.code) === normalizeName(resource.code) ? 100 : 0
  // Quota books often use generic labour grades (一般技工/高级技工), while
  // the official wage book lists the trade (建筑工、抹灰工等). Keep these
  // candidates visible for AI review, but rank exact trade/name matches above.
  const genericLaborFallback = expectedCategory === 'labor' &&
    /(?:技工|工人|人工)/.test(normalizeName(resource.name)) &&
    item.resourceCategory === 'labor'
  if (sameMachineFamily) nameScore = Math.max(nameScore, 45)
  if (!nameScore && !genericLaborFallback) return 0
  return (nameScore || 25) + codeScore + (genericLaborFallback ? 0 : 20)
}

function machineFamily(value: string) {
  const normalized = normalizeName(value)
  const families = ['履带式单斗挖掘机', '挖掘机', '推土机', '自卸汽车', '载重汽车', '夯实机', '压路机', '洒水车', '铲运机', '装载机', '平地机', '起重机']
  return families.find((family) => normalized.includes(normalizeName(family)))
}

function candidateRetrievalScore(candidate: KnowledgePriceCandidate) {
  return candidate.relevanceScore ?? candidate.score ?? 0
}

function resourceCategoryLabel(category: QuotaPricingResource['category']) {
  if (category === '人工') return '人工'
  if (category === '材料') return '材料'
  if (category === '机械') return '机械'
  return '未分类'
}

function normalizedCategory(category: QuotaPricingResource['category']): ResourceCategory {
  if (category === '人工') return 'labor'
  if (category === '材料') return 'material'
  if (category === '机械') return 'machine'
  return 'unclassified'
}

function parseQuotaUnit(value: string) {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, '')
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)?(.*)$/)
  const unit = normalizeResourceUnit(match?.[2] ?? '')
  if (!unit) throw new Error(`Quota unit is missing: ${value}.`)
  return { base: parseDecimal(match?.[1] || '1'), unit }
}

type UnitDimension = 'length' | 'area' | 'volume' | 'mass' | 'count' | 'workday' | 'machine'
type UnitDefinition = { dimension: UnitDimension; display: string; toBase: DecimalValue }

function unitDefinition(value: string): UnitDefinition | undefined {
  const unit = normalizeResourceUnit(value)
  const definitions: Record<string, UnitDefinition> = {
    mm: { dimension: 'length', display: 'mm', toBase: parseDecimal('0.001') },
    cm: { dimension: 'length', display: 'cm', toBase: parseDecimal('0.01') },
    m: { dimension: 'length', display: 'm', toBase: parseDecimal('1') },
    km: { dimension: 'length', display: 'km', toBase: parseDecimal('1000') },
    m2: { dimension: 'area', display: 'm2', toBase: parseDecimal('1') },
    cm2: { dimension: 'area', display: 'cm2', toBase: parseDecimal('0.0001') },
    mm2: { dimension: 'area', display: 'mm2', toBase: parseDecimal('0.000001') },
    m3: { dimension: 'volume', display: 'm3', toBase: parseDecimal('1') },
    dm3: { dimension: 'volume', display: 'dm3', toBase: parseDecimal('0.001') },
    cm3: { dimension: 'volume', display: 'cm3', toBase: parseDecimal('0.000001') },
    l: { dimension: 'volume', display: 'L', toBase: parseDecimal('0.001') },
    ml: { dimension: 'volume', display: 'mL', toBase: parseDecimal('0.000001') },
    kg: { dimension: 'mass', display: 'kg', toBase: parseDecimal('1') },
    g: { dimension: 'mass', display: 'g', toBase: parseDecimal('0.001') },
    t: { dimension: 'mass', display: 't', toBase: parseDecimal('1000') },
    个: { dimension: 'count', display: '个', toBase: parseDecimal('1') },
    件: { dimension: 'count', display: '件', toBase: parseDecimal('1') },
    套: { dimension: 'count', display: '套', toBase: parseDecimal('1') },
    工日: { dimension: 'workday', display: '工日', toBase: parseDecimal('1') },
    小时: { dimension: 'workday', display: '小时', toBase: parseDecimal('0.125') },
    台班: { dimension: 'machine', display: '台班', toBase: parseDecimal('1') }
  }
  return definitions[unit]
}

function feeBase(
  base: PricingFeeBase,
  costs: { labor: DecimalValue; material: DecimalValue; machine: DecimalValue },
  directTotal: DecimalValue,
  runningTotal: DecimalValue
) {
  if (base === 'labor_cost') return costs.labor
  if (base === 'material_cost') return costs.material
  if (base === 'machine_cost') return costs.machine
  if (base === 'labor_plus_machine') return add(costs.labor, costs.machine)
  if (base === 'running_total') return runningTotal
  return directTotal
}

type DecimalValue = { integer: bigint; scale: number }

function zero(): DecimalValue { return { integer: 0n, scale: 0 } }

function one(): DecimalValue { return { integer: 1n, scale: 0 } }

function parseDecimal(value: string): DecimalValue {
  const normalized = value.trim()
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(normalized)) throw new Error(`Invalid decimal ${value}.`)
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, fraction = ''] = unsigned.split('.')
  return {
    integer: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n),
    scale: fraction.length
  }
}

function parsePercentage(value: string) {
  const parsed = parseDecimal(value)
  if (parsed.integer < 0n) throw new Error(`Fee rate cannot be negative: ${value}.`)
  return parsed
}

function add(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale)
  return {
    integer: left.integer * power10(scale - left.scale) + right.integer * power10(scale - right.scale),
    scale
  }
}

function multiply(left: DecimalValue, right: DecimalValue): DecimalValue {
  return { integer: left.integer * right.integer, scale: left.scale + right.scale }
}

function divide(left: DecimalValue, right: DecimalValue, targetScale: number): DecimalValue {
  if (right.integer === 0n) throw new Error('Division by zero.')
  const exponent = right.scale + targetScale - left.scale
  const numerator = exponent >= 0 ? left.integer * power10(exponent) : left.integer
  const denominator = exponent >= 0 ? right.integer : right.integer * power10(-exponent)
  return { integer: divideRounded(numerator, denominator), scale: targetScale }
}

function divideRounded(numerator: bigint, denominator: bigint) {
  const negative = (numerator < 0n) !== (denominator < 0n)
  const left = numerator < 0n ? -numerator : numerator
  const right = denominator < 0n ? -denominator : denominator
  const rounded = (left + right / 2n) / right
  return negative ? -rounded : rounded
}

function formatDecimal(value: DecimalValue, targetScale: number, trim: boolean) {
  const rounded = value.scale === targetScale
    ? value.integer
    : value.scale < targetScale
      ? value.integer * power10(targetScale - value.scale)
      : divideRounded(value.integer, power10(value.scale - targetScale))
  const negative = rounded < 0n
  const absolute = negative ? -rounded : rounded
  if (targetScale === 0) return `${negative ? '-' : ''}${absolute}`
  const text = absolute.toString().padStart(targetScale + 1, '0')
  const whole = text.slice(0, -targetScale)
  let fraction = text.slice(-targetScale)
  if (trim) fraction = fraction.replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

function power10(exponent: number) { return 10n ** BigInt(exponent) }

function numberText(value: number) {
  const text = String(value)
  if (/e/i.test(text)) throw new Error(`Unsupported numeric value ${value}.`)
  return text
}

function normalizeName(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[·。.]/g, '')
    .replace(/千瓦/g, 'kw')
    .replace(/立方米/g, 'm3')
    .replace(/[\s\-_/\\,，.。()（）]/g, '')
}
