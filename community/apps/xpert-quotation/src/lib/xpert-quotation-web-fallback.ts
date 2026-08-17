import { createHash } from 'node:crypto'
import { priceEvidenceSupports } from './xpert-quotation-knowledge.js'
import { initializeQuotaPricingFormulaRules } from './xpert-quotation-resource-pricing.js'
import type {
  ExternalEvidenceSource,
  ExternalPriceSource,
  QuotaBreakdownComponent,
  QuotaBreakdownProposal,
  QuotaResourceConsumption,
  WebQuotaBreakdownProposalInput
} from './types.js'

const MAX_WEB_SOURCES = 5
const MAX_WEB_RESOURCES = 60
const QUOTA_CODE = /^\d{1,2}-\d{1,4}$/
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/
const PLACEHOLDER_WEB_HOSTS = new Set(['example.com', 'example.org', 'example.net', 'localhost'])

export function buildWebQuotaBreakdownProposal(
  lineDiscipline: 'building' | 'installation',
  workScopes: string[],
  input: WebQuotaBreakdownProposalInput,
  proposedAt = new Date()
): QuotaBreakdownProposal {
  const currentScopes = uniqueStrings(workScopes.map((scope) => boundedText(scope, 240)).filter(Boolean))
  if (!currentScopes.length) throw new Error('The current bill line has no persisted work scopes.')
  if (!input.components.length) throw new Error('At least one web-supported quota component is required.')
  if (input.components.length > 16) throw new Error('A web quota breakdown may contain at most 16 components.')

  const coveredScopes = new Set<string>()
  const components = input.components.map((component, componentIndex): QuotaBreakdownComponent => {
    requireConfidence(component.confidence)
    const quotaCode = boundedText(component.quotaCode, 40)
    if (quotaCode && !QUOTA_CODE.test(quotaCode)) throw new Error(`Web quota code ${quotaCode} is invalid.`)
    const quotaName = requiredText(component.quotaName, 'Web quota name', 240)
    const quotaUnit = requiredText(component.quotaUnit, 'Web quota unit', 40)
    const sources = normalizeWebEvidenceSources(component.sources)
    const selectedScopes = uniqueStrings(component.coveredWorkScopes.map((scope) => boundedText(scope, 240)).filter(Boolean))
    if (!selectedScopes.length) throw new Error(`Web quota component ${quotaName} must cover at least one work scope.`)
    for (const scope of selectedScopes) {
      if (!currentScopes.includes(scope)) throw new Error(`Covered work scope is not in the persisted bill facts: ${scope}`)
      if (coveredScopes.has(scope)) throw new Error(`Work scope is covered more than once: ${scope}`)
      coveredScopes.add(scope)
    }
    const resources = normalizeWebQuotaResources(component.resources, sources, componentIndex)
    const candidateId = `web_quota_${createHash('sha256')
      .update(JSON.stringify({ quotaCode, quotaName, quotaUnit, selectedScopes, sources, resources }))
      .digest('hex')
      .slice(0, 32)}`
    return {
      candidateId,
      ...(quotaCode ? { quotaCode } : {}),
      quotaName,
      quotaUnit,
      coveredWorkScopes: selectedScopes,
      confidence: component.confidence,
      rationale: requiredText(component.rationale, 'Web quota rationale', 600),
      differences: uniqueStrings(component.differences.map((difference) => requiredText(difference, 'Web quota difference', 200))).slice(0, 8),
      knowledgebaseId: 'web',
      sourcePages: [],
      sourceReviewStatus: 'web_evidence_unreviewed',
      sourceIngestionReady: false,
      resources,
      sourceKind: 'web',
      externalSources: sources
    }
  })

  const uncoveredWorkScopes = uniqueStrings(input.uncoveredWorkScopes.map((scope) => boundedText(scope, 240)).filter(Boolean))
  for (const scope of uncoveredWorkScopes) {
    if (!currentScopes.includes(scope)) throw new Error(`Uncovered work scope is not in the persisted bill facts: ${scope}`)
    if (coveredScopes.has(scope)) throw new Error(`Work scope cannot be both covered and uncovered: ${scope}`)
  }
  const partition = new Set([...coveredScopes, ...uncoveredWorkScopes])
  if (partition.size !== currentScopes.length || currentScopes.some((scope) => !partition.has(scope))) {
    throw new Error('Covered and uncovered work scopes must partition every persisted bill work scope exactly once.')
  }

  const blockingReasons = new Set<string>(['pricing_not_evaluated', 'web_source_requires_review'])
  if (uncoveredWorkScopes.length) blockingReasons.add('uncovered_work')
  if (lineDiscipline === 'installation' && !components.length) blockingReasons.add('missing_installation_quota')
  if (components.some((component) => component.resources.some((resource) => resource.consumptionPending))) {
    blockingReasons.add('incomplete_quota_candidate')
  }
  const proposal: QuotaBreakdownProposal = {
    coverageStatus: uncoveredWorkScopes.length ? 'partial' : 'complete',
    mappingStatus: 'proposed',
    components,
    uncoveredWorkScopes,
    skippedUncoveredWorkScopes: [],
    blockingReasons: [...blockingReasons],
    automaticPricingAllowed: false,
    rationale: requiredText(input.rationale, 'Web quota breakdown rationale', 800),
    proposedAt: proposedAt.toISOString()
  }
  return { ...proposal, pricingFormulaRules: initializeQuotaPricingFormulaRules(components) }
}

export function normalizeWebEvidenceSources(input: ExternalEvidenceSource[]) {
  if (!input.length) throw new Error('At least one web evidence source is required.')
  const urls = new Set<string>()
  return input.slice(0, MAX_WEB_SOURCES).map((source) => {
    const title = requiredText(source.title, 'Web source title', 160)
    const url = normalizeWebUrl(source.url)
    if (urls.has(url)) throw new Error('Web evidence sources must have unique URLs.')
    urls.add(url)
    return {
      title,
      url,
      quote: requiredText(source.quote, 'Web source evidence quote', 500),
      ...(boundedText(source.publishedAt, 80) ? { publishedAt: boundedText(source.publishedAt, 80) } : {})
    }
  })
}

export function normalizeWebPriceSources(input: ExternalPriceSource[], unitPrice: string, sourceUnit: string) {
  const sources = normalizeWebEvidenceSources(input)
  if (sources.some((source) => !priceEvidenceSupports(source.quote, unitPrice, sourceUnit))) {
    throw new Error('Every web price source quote must explicitly contain the recommended unit price and source unit.')
  }
  return sources
}

function normalizeWebQuotaResources(
  input: WebQuotaBreakdownProposalInput['components'][number]['resources'],
  sources: ExternalEvidenceSource[],
  componentIndex: number
): QuotaResourceConsumption[] {
  if (!input.length) throw new Error('Every web quota component must include at least one labor, material, or machine resource.')
  if (input.length > MAX_WEB_RESOURCES) throw new Error(`A web quota component may include at most ${MAX_WEB_RESOURCES} resources.`)
  const evidence = sources.map((source) => source.quote.normalize('NFKC')).join('\n')
  return input.map((resource, resourceIndex) => {
    const name = requiredText(resource.name, 'Web quota resource name', 240)
    const unit = requiredText(resource.unit, 'Web quota resource unit', 40)
    const consumption = requiredText(resource.consumption, 'Web quota resource consumption', 40)
    if (!DECIMAL.test(consumption)) throw new Error(`Web quota resource consumption must be a non-negative decimal: ${name}`)
    const consumptionPending = resource.consumptionPending === true
    if (consumptionPending && canonicalDecimal(consumption) !== '0') {
      throw new Error(`Pending web quota resource consumption must be 0 instead of a guessed quantity: ${name}`)
    }
    if (!consumptionPending && !evidenceContainsDecimal(evidence, consumption)) {
      throw new Error(`Web evidence does not contain the consumption ${consumption} for resource ${name}; mark it pending instead of inventing a quantity.`)
    }
    const code = boundedText(resource.code, 80) || `WEB-${componentIndex + 1}-${resourceIndex + 1}`
    return {
      category: resource.category,
      code,
      name,
      unit,
      consumption,
      ...(consumptionPending ? { consumptionPending: true } : {})
    }
  })
}

function evidenceContainsDecimal(evidence: string, expected: string) {
  const canonical = canonicalDecimal(expected)
  const values = evidence.replace(/[，,]/g, '').match(/[0-9]+(?:\.[0-9]+)?/g) ?? []
  return values.some((value) => canonicalDecimal(value) === canonical)
}

function canonicalDecimal(value: string) {
  const [integer, fraction = ''] = value.split('.')
  const trimmedFraction = fraction.replace(/0+$/, '')
  return trimmedFraction ? `${Number(integer)}.${trimmedFraction}` : String(Number(integer))
}

function normalizeWebUrl(value: string) {
  const normalized = requiredText(value, 'Web source URL', 2048)
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('Web source URL is invalid.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Web source URL must use HTTP or HTTPS.')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    PLACEHOLDER_WEB_HOSTS.has(hostname) ||
    hostname.endsWith('.example.com') ||
    hostname.endsWith('.example.org') ||
    hostname.endsWith('.example.net') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(hostname) ||
    hostname === '::1'
  ) {
    throw new Error('Web source URL must identify a real public source, not a placeholder or local address.')
  }
  return url.toString()
}

function requireConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Confidence must be between 0 and 1.')
}

function requiredText(value: string | undefined, label: string, maximum: number) {
  const normalized = boundedText(value, maximum)
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function boundedText(value: string | undefined, maximum: number) {
  return value?.replace(/\u0000/g, '').trim().slice(0, maximum) ?? ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}
