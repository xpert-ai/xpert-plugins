import { tool } from '@langchain/core/tools'
import { BadRequestException, Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  KnowledgebaseRuntimeCapability,
  RequestContext,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  XPERT_QUOTATION_CONSUMPTION_MIDDLEWARE_NAME,
  XPERT_QUOTATION_CONSUMPTION_TOOL_NAMES,
  XPERT_QUOTATION_COORDINATOR_MIDDLEWARE_NAME,
  XPERT_QUOTATION_COORDINATOR_TOOL_NAMES,
  XPERT_QUOTATION_FEATURE,
  XPERT_QUOTATION_ICON,
  XPERT_QUOTATION_LINE_WORKER_MIDDLEWARE_NAME,
  XPERT_QUOTATION_LINE_WORKER_TOOL_NAMES,
  XPERT_QUOTATION_MIDDLEWARE_NAME,
  XPERT_QUOTATION_PATCH_CAPABILITY,
  XPERT_QUOTATION_PRICE_MIDDLEWARE_NAME,
  XPERT_QUOTATION_PRICE_TOOL_NAMES,
  XPERT_QUOTATION_TOOL_NAMES,
  type XpertQuotationToolName
} from './constants.js'
import { XpertQuotationService, toPublicQuotaBreakdown } from './xpert-quotation.service.js'
import { MAX_RESOURCE_PRICE_CANDIDATES } from './xpert-quotation-resource-pricing.js'
import { XpertQuotationWebFallbackService } from './xpert-quotation-web-fallback.service.js'
import { parseWorkbookRecognitionInput, workbookRecognitionSchema } from './xpert-workbook.mapping.js'
import type { XpertScope } from './types.js'

const quotationWorkbenchContextValueSchema = z.object({
  quotationId: z.string().uuid().optional(),
  quotationTitle: z.string().trim().max(240).optional(),
  fileName: z.string().trim().max(240).optional(),
  officeVersionNumber: z.number().int().positive().optional(),
  activeView: z.enum(['quotation', 'review', 'approved', 'knowledge']).optional(),
  activeSheetName: z.string().trim().max(240).optional(),
  selectedRange: z.string().trim().max(120).optional(),
  dirty: z.boolean().optional(),
  currentSnapshotId: z.string().trim().max(160).optional()
}).strict()
const quotationWorkbenchRequestContextSchema = z.object({
  xpert_quotation_workbench: quotationWorkbenchContextValueSchema.optional()
})
type QuotationWorkbenchRuntimeContext = z.infer<typeof quotationWorkbenchContextValueSchema>

const emptySchema = z.object({}).strict()
const quotationSchema = z.object({ quotationId: z.string().uuid() }).strict()
const lineSchema = quotationSchema.extend({ lineId: z.string().uuid() }).strict()
const issuesSchema = quotationSchema.extend({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
}).strict()
const knowledgeSearchSchema = lineSchema.extend({
  topK: z.number().int().min(1).max(MAX_RESOURCE_PRICE_CANDIDATES).optional().describe('Maximum current knowledge chunks to return. The server caps this at 5.')
}).strict()
const quotaSearchSchema = lineSchema.extend({
  topK: z.number().int().min(1).max(MAX_RESOURCE_PRICE_CANDIDATES).optional().describe('Maximum current normalized quota-item chunks to return. The server caps this at 5.')
}).strict()
const quotaBreakdownComponentSchema = z.object({
  candidateId: z.string().trim().min(1).max(64).describe('Exact candidateId from the latest xpert_quotation_search_quota_components response for this line. IDs are line-specific and search-specific; never reuse one for another line or after a re-search.'),
  quotaCode: z.string().trim().regex(/^\d{1,2}-\d{1,4}$/)
    .optional()
    .describe('Optional verification hint copied from the selected candidate. It must match that candidate; it is not used to select a candidate.'),
  coveredWorkScopes: z.array(z.string().trim().min(1).max(240)).min(1).max(16)
    .describe('Exact persisted workScopes covered by this quota candidate.'),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  differences: z.array(z.string().trim().min(1).max(200)).max(8)
}).strict()
const quotaBreakdownSchema = lineSchema.extend({
  components: z.array(quotaBreakdownComponentSchema).max(16)
    .refine((items) => new Set(items.map((item) => item.candidateId)).size === items.length, 'Each quota candidate may be used at most once.'),
  uncoveredWorkScopes: z.array(z.string().trim().min(1).max(240)).max(16),
  rationale: z.string().trim().min(1).max(800)
}).strict()
const webEvidenceSourceSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.string().url().max(2048),
  quote: z.string().trim().min(1).max(500)
    .describe('Exact short excerpt from this URL that supports the quota component, resource consumption, or price.'),
  publishedAt: z.string().trim().min(1).max(80).optional()
}).strict()
const webQuotaResourceSchema = z.object({
  category: z.enum(['人工', '材料', '机械', '未分类']),
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(240),
  unit: z.string().trim().min(1).max(40),
  consumption: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/),
  consumptionPending: z.boolean().optional()
    .describe('Set true when the web evidence does not state an exact consumption. In that case use 0 as the placeholder and never invent a quantity.')
}).strict()
const webQuotaBreakdownComponentSchema = z.object({
  // Web evidence can use national, provincial, or publisher-specific quota
  // codes (for example "02060194" or "鄂修缮装饰-2020-拆除-金属门窗").
  // Keep this bounded, but do not force the short internal `12-1` shape used
  // by knowledgebase candidates.
  quotaCode: z.string().trim().min(1).max(160).optional(),
  quotaName: z.string().trim().min(1).max(240),
  quotaUnit: z.string().trim().min(1).max(40),
  coveredWorkScopes: z.array(z.string().trim().min(1).max(240)).min(1).max(16),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  differences: z.array(z.string().trim().min(1).max(200)).max(8),
  resources: z.array(webQuotaResourceSchema).min(1).max(60),
  sources: z.array(webEvidenceSourceSchema).min(1).max(5)
}).strict()
const webQuotaBreakdownSchema = lineSchema.extend({
  components: z.array(webQuotaBreakdownComponentSchema).min(1).max(16),
  uncoveredWorkScopes: z.array(z.string().trim().min(1).max(240)).max(16),
  rationale: z.string().trim().min(1).max(800),
  changeSummary: z.string().trim().min(1).max(240)
}).strict()
const quotaBreakdownReviewSchema = lineSchema.extend({
  decision: z.enum(['approve', 'reject']),
  comment: z.string().trim().min(1).max(600),
  changeSummary: z.string().trim().min(1).max(240),
  userConfirmed: z.literal(true).describe('Must be true only after the user explicitly approves this quota-breakdown review decision.')
}).strict()
const resourceSearchSchema = lineSchema.extend({
  resourceId: z.string().trim().min(1).max(80)
    .describe('Exact resourceId returned by the current xpert_quotation_propose_quota_breakdown response for this line.'),
  topK: z.number().int().min(1).max(MAX_RESOURCE_PRICE_CANDIDATES).optional().describe('Maximum current price chunks to return. The server caps this at 5.')
}).strict()
const resourcePriceRecommendationSchema = lineSchema.extend({
  resourceId: z.string().trim().min(1).max(80),
  candidateId: z.string().trim().min(1).max(64)
    .describe('Exact candidateId from the latest xpert_quotation_search_resource_prices response for this resource.'),
  priceItemId: z.string().trim().min(1).max(80)
    .describe('Exact structured priceItemId listed in matchedPriceItemIds for the selected current candidate.'),
  quotaWorkdayHours: z.number().positive().max(24).optional()
    .describe('Reviewed workday-hour basis of the quota resource. Required when the selected labor price states a source workday-hour basis.'),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  differences: z.array(z.string().trim().min(1).max(200)).max(8),
  changeSummary: z.string().trim().min(1).max(240)
}).strict()
const resourcePriceReviewSchema = lineSchema.extend({
  resourceId: z.string().trim().min(1).max(80),
  decision: z.enum(['approve', 'reject']),
  comment: z.string().trim().min(1).max(600),
  changeSummary: z.string().trim().min(1).max(240),
  userConfirmed: z.literal(true)
    .describe('Must be true only after the user explicitly approves or rejects this exact resource-price recommendation and any workday conversion.')
}).strict()
const feeRateSchema = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/)
const comprehensiveRateSchema = lineSchema.extend({
  fees: z.array(z.object({
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    ratePercent: feeRateSchema,
    base: z.enum(['direct_cost', 'labor_cost', 'material_cost', 'machine_cost', 'labor_plus_machine', 'running_total'])
  }).strict()).max(16).default([])
    .refine((fees) => new Set(fees.map((fee) => fee.code)).size === fees.length, 'Fee rule codes must be unique.'),
  unitPriceScale: z.number().int().min(2).max(6).optional(),
  changeSummary: z.string().trim().min(1).max(240),
  userConfirmed: z.literal(true)
    .describe('Must be true only after the user explicitly confirms the complete ordered fee rules and authorizes calculation for this line.')
}).strict()
const knowledgeRecommendationSchema = lineSchema.extend({
  candidateId: z.string().trim().min(1).max(64).describe('Must be a current candidate id returned by xpert_quotation_search_knowledge_prices for this exact line.'),
  unitPrice: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/),
  sourceUnit: z.string().trim().min(1).max(40).describe('Unit stated by the selected knowledge chunk. It may differ from the quotation material unit only when the deterministic unit converter supports the conversion.'),
  matchedMaterialName: z.string().trim().min(1).max(240),
  matchedSpecification: z.string().trim().min(1).max(600).optional(),
  evidenceQuote: z.string().trim().min(4).max(500).describe('Exact excerpt from the selected current chunk containing the recommended price and unit.'),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  differences: z.array(z.string().trim().min(1).max(160)).max(8),
  changeSummary: z.string().trim().min(1).max(240)
}).strict()
const knowledgeNoMatchSchema = lineSchema.extend({
  reviewedCandidateIds: z.array(z.string().trim().min(1).max(64)).max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'reviewedCandidateIds must be unique.'),
  rationale: z.string().trim().min(1).max(600),
  changeSummary: z.string().trim().min(1).max(240)
}).strict()
const webPriceSourceSchema = webEvidenceSourceSchema
const webPriceRecommendationSchema = lineSchema.extend({
  unitPrice: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/),
  sourceUnit: z.string().trim().min(1).max(40).describe('Unit used by the recommended price. It may differ from the quotation material unit only when the deterministic unit converter supports the conversion.'),
  currency: z.literal('CNY'),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  sources: z.array(webPriceSourceSchema).min(1).max(5),
  changeSummary: z.string().trim().min(1).max(240)
}).strict()
const webResourcePriceRecommendationSchema = lineSchema.extend({
  resourceId: z.string().trim().min(1).max(80),
  unitPrice: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/),
  sourceUnit: z.string().trim().min(1).max(40),
  currency: z.literal('CNY'),
  sourceWorkdayHours: z.number().positive().max(24).optional(),
  quotaWorkdayHours: z.number().positive().max(24).optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  differences: z.array(z.string().trim().min(1).max(200)).max(8),
  sources: z.array(webPriceSourceSchema).min(1).max(5),
  changeSummary: z.string().trim().min(1).max(240)
}).strict()
const applySchema = quotationSchema.extend({
  lineId: z.string().uuid().optional().describe('Optional exact quotation line to write. When provided, only that row is patched and workbook totals are not recalculated.'),
  changeSummary: z.string().min(1).max(240),
  userConfirmed: z.literal(true).describe('Must be true only after the user explicitly approves applying the reviewed patch.'),
  overwriteExisting: z.literal(true).optional().describe('Set only after the user explicitly confirms overwriting occupied Excel target cells reported by the previous call.'),
  expectedVersionNumber: z.number().int().positive().optional().describe('Workbook version returned with overwrite_required. Required together with overwriteExisting.')
}).strict().refine(
  (value) => value.overwriteExisting === true ? value.expectedVersionNumber != null : value.expectedVersionNumber == null,
  { path: ['expectedVersionNumber'], message: 'expectedVersionNumber is required only when overwriteExisting is true' }
)

@Injectable()
export class XpertQuotationMiddlewareFactory {
  constructor(
    private readonly service: XpertQuotationService,
    private readonly webFallback: XpertQuotationWebFallbackService
  ) {}

  createMiddleware(
    name: string,
    toolNames: readonly XpertQuotationToolName[],
    context: IAgentMiddlewareContext,
    includeWorkbenchContext: boolean
  ): AgentMiddleware {
    const scope = scopeFromContext(context)
    const tools: NonNullable<AgentMiddleware['tools']> = [
        tool(async (_input, config) => {
          const runtimeContext = readQuotationWorkbenchRuntimeContext(config)
          return JSON.stringify(await this.service.getCurrentWorkbenchContext(scope, runtimeContext), null, 2)
        }, {
          name: 'xpert_quotation_get_current_workbench_context',
          description: 'Read the currently open quotation project, Workbench view, file metadata, file path, sheet names, and review status without loading workbook cells or file content. Call this first for questions about the open quotation, project, view, file, or workbook; the server can resolve the latest quotation in the current scope when the view context has not arrived yet. Do not ask the user for quotationId unless the tool returns workbench_context_unavailable. When content is needed, use the returned file path with parsed-file or sandbox file tools, and use xpert_quotation_inspect_workbook for authoritative XLSX inspection.',
          schema: emptySchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.getAgentSummary(scope, input.quotationId), null, 2), {
          name: 'xpert_quotation_get_summary',
          description: 'Read the current quotation status, counts, recognition summary, and pricing-source state. Use xpert_quotation_list_issues for paged line evidence.',
          schema: quotationSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.inspectWorkbook(scope, input.quotationId), null, 2), {
          name: 'xpert_quotation_inspect_workbook',
          description: 'Read the current workbook catalog and bounded cell samples before recognition. Call this first because worksheet names, header rows, and columns are not fixed. Map every observed 项目特征描述 or specification column into columns.specification.',
          schema: quotationSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => {
          const recognition = parseWorkbookRecognitionInput(input)
          return JSON.stringify(await this.service.matchQuotation(scope, recognition.quotationId, recognition), null, 2)
        }, {
          name: 'xpert_quotation_start_matching',
          description: 'Validate and persist AI-derived worksheet/column mappings, then extract unresolved quotation rows. No uploaded price list is used. Call xpert_quotation_inspect_workbook first and map full project-feature/specification columns. For a measure sheet with only one price column, omit columns.amount.',
          schema: workbookRecognitionSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.getIssues(scope, input.quotationId, input.page, input.pageSize), null, 2), {
          name: 'xpert_quotation_list_issues',
          description: 'List unresolved quotation rows with full project-feature/specification text and any persisted knowledge or web evidence. Page until hasNext is false before claiming review is complete.',
          schema: issuesSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => {
          const knowledgebase = context.runtime.capabilities?.get(KnowledgebaseRuntimeCapability)
          return JSON.stringify(await this.service.searchQuotaComponents(
            scope,
            input.quotationId,
            input.lineId,
            context.knowledgebaseIds ?? [],
            knowledgebase,
            input.topK
          ), null, 2)
        }, {
          name: 'xpert_quotation_search_quota_components',
          description: 'For one unresolved bill row, classify the row-level meaning first. Search the connected 消耗量定额知识库 with 项目名称 + 对应项目特征规格 + 消耗量. Return at most 5 quota candidates with code/name/unit and 人工、材料、机械 unit consumption. A procurement/supply bill row without a construction action is returned as directMaterial with one material resource so the price Agent can search its price; a construction bill returns consumption quotas. This lookup does not calculate a comprehensive rate or write Excel.',
          schema: quotaSearchSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => {
          const proposal = await this.service.proposeQuotaBreakdown(
            scope,
            input.quotationId,
            input.lineId,
            {
              components: input.components,
              uncoveredWorkScopes: input.uncoveredWorkScopes,
              rationale: input.rationale
            }
          )
          return JSON.stringify({
            ...proposal,
            proposal: toPublicQuotaBreakdown(proposal.proposal)
          }, null, 2)
        }, {
          name: 'xpert_quotation_propose_quota_breakdown',
          description: 'Persist an auditable 1:N consumption-component proposal for one bill row immediately after its current consumption search. This tool only validates and saves the quota mapping, then returns the extracted 人工、材料、机械 resources for a separate price Agent; it never searches a price knowledgebase. Each component accepts candidateId, optional quotaCode, coveredWorkScopes, confidence, rationale, and differences only. candidateId is scoped to this exact line and latest search snapshot; never reuse it across lines or after re-searching. Optional quotaCode is verified but never selects a candidate. Covered and uncovered workScopes must partition every persisted work scope exactly once. After this tool succeeds, send each returned resource to the price Agent for resource-level price search.',
          schema: quotaBreakdownSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify({
          ...await this.webFallback.recommendWebQuotaBreakdown(
            scope,
            input.quotationId,
            input.lineId,
            {
              components: input.components,
              uncoveredWorkScopes: input.uncoveredWorkScopes,
              rationale: input.rationale
            }
          ),
          changeSummary: input.changeSummary
        }, null, 2), {
          name: 'xpert_quotation_recommend_web_quota_breakdown',
          description: 'Persist a web-supported engineering and consumption-quota breakdown only when no consumption knowledgebase is connected or the current search returned no defensible candidate. The consumption Agent must call web_search/web_fetch first. Supply real HTTP(S) URLs and exact excerpts. Every non-pending resource consumption must appear in those excerpts; when evidence does not state a quantity, set consumptionPending=true and consumption=0 instead of guessing. This creates a proposed mapping for human review and never approves, calculates, or writes Excel.',
          schema: webQuotaBreakdownSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => {
          const result = await this.service.reviewQuotaBreakdown(
            scope,
            input.quotationId,
            input.lineId,
            input.decision,
            input.comment
          )
          const { blockingReasons: _blockingReasons, automaticPricingAllowed: _automaticPricingAllowed, ...publicResult } = result
          return JSON.stringify({ ...publicResult, changeSummary: input.changeSummary }, null, 2)
        }, {
          name: 'xpert_quotation_review_quota_breakdown',
          description: 'Approve or reject the current persisted quota-component proposal only after explicit user confirmation. This records the mapping decision; use the 人工、机械、材料 resource candidates and the calculation action to continue pricing.',
          schema: quotaBreakdownReviewSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => {
          const knowledgebase = context.runtime.capabilities?.require(KnowledgebaseRuntimeCapability)
          if (!knowledgebase) throw new BadRequestException('Knowledgebase runtime capability is unavailable.')
          return JSON.stringify(await this.service.searchResourcePrices(
            scope,
            input.quotationId,
            input.lineId,
            input.resourceId,
            context.knowledgebaseIds ?? [],
            knowledgebase,
            input.topK
          ), null, 2)
        }, {
          name: 'xpert_quotation_search_resource_prices',
          description: 'After a current quota or direct-material resource breakdown is persisted, search only the connected 价格知识库 for exactly one server-extracted labor, material, or machine resource. The query uses 项目名称/资源名称 + 对应规格或别名 + 元 + 价格. Labor searches include 普工、建筑工、木工等 aliases; machine searches keep at most 5 similar model/capacity options for human review; material searches require name/specification and compatible unit. The server never uses the bill m2/m3 unit as a resource price unit. Flat labor-wage text and Markdown price tables are parsed into structured price items.',
          schema: resourceSearchSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.recommendResourcePrice(
          scope,
          input.quotationId,
          input.lineId,
          {
            resourceId: input.resourceId,
            candidateId: input.candidateId,
            priceItemId: input.priceItemId,
            quotaWorkdayHours: input.quotaWorkdayHours,
            confidence: input.confidence,
            rationale: input.rationale,
            differences: input.differences
          }
        ), null, 2), {
          name: 'xpert_quotation_recommend_resource_price',
          description: 'Persist one structured price recommendation from the latest search for one exact consumption resource. Resource and source units must match. If a labor source states a workday-hour basis, quotaWorkdayHours is required and the service records the deterministic conversion. This is an AI recommendation only and cannot be calculated or written until reviewed.',
          schema: resourcePriceRecommendationSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify({
          ...await this.webFallback.recommendWebResourcePrice(
            scope,
            input.quotationId,
            input.lineId,
            {
              resourceId: input.resourceId,
              unitPrice: input.unitPrice,
              sourceUnit: input.sourceUnit,
              currency: input.currency,
              sourceWorkdayHours: input.sourceWorkdayHours,
              quotaWorkdayHours: input.quotaWorkdayHours,
              confidence: input.confidence,
              rationale: input.rationale,
              differences: input.differences,
              sources: input.sources
            }
          ),
          changeSummary: input.changeSummary
        }, null, 2), {
          name: 'xpert_quotation_recommend_web_resource_price',
          description: 'Persist an evidence-backed web price for one exact labor, material, or machine resource from the current quota breakdown when no price knowledgebase is connected or no defensible price candidate exists. Call web_search/web_fetch first and provide 1-5 real HTTP(S) URLs whose exact excerpts each contain the stated price and unit. This creates a recommendation for human review and never approves, calculates, or writes Excel.',
          schema: webResourcePriceRecommendationSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify({
          ...await this.service.reviewResourcePrice(scope, input.quotationId, input.lineId, {
            resourceId: input.resourceId,
            decision: input.decision,
            comment: input.comment
          }),
          changeSummary: input.changeSummary
        }, null, 2), {
          name: 'xpert_quotation_review_resource_price',
          description: 'Approve or reject one current consumption-resource price recommendation only after explicit user confirmation. Approval includes the source unit, evidence, price period context, and any recorded workday-hour conversion; it never calculates or writes Excel by itself.',
          schema: resourcePriceReviewSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify({
          ...await this.service.calculateComprehensiveRate(scope, input.quotationId, input.lineId, {
            fees: input.fees ?? [],
            unitPriceScale: input.unitPriceScale
          }),
          changeSummary: input.changeSummary
        }, null, 2), {
          name: 'xpert_quotation_calculate_comprehensive_rate',
          description: 'Run the deterministic comprehensive-rate engine for one bill row after a quota breakdown is available. Group quota resources into labor, machine, and material, multiply consumption by approved normalized resource prices, and treat missing or skipped resources as zero with calculationWarnings instead of blocking the result. Formula rules are omitted by default; explicit fees are optional. Persist the full trace and confirm the line price. This tool does not write Excel; call xpert_quotation_apply_patch only after explicit user approval.',
          schema: comprehensiveRateSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => {
          const knowledgebase = context.runtime.capabilities?.require(KnowledgebaseRuntimeCapability)
          if (!knowledgebase) throw new BadRequestException('Knowledgebase runtime capability is unavailable.')
          return JSON.stringify(await this.service.searchKnowledgePrices(
            scope,
            input.quotationId,
            input.lineId,
            context.knowledgebaseIds ?? [],
            knowledgebase,
            input.topK
          ), null, 2)
        }, {
          name: 'xpert_quotation_search_knowledge_prices',
          description: 'Search platform-native Markdown tables, OCR text, and structured price chunks only in the connected 价格知识库 for one unresolved kind=material row. Bill rows are rejected and must use consumption decomposition plus resource-price search. The server constructs the query from persisted material name, complete 项目特征描述/specification, unit, and code and persists bounded source evidence.',
          schema: knowledgeSearchSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.recommendKnowledgePrice(scope, input.quotationId, input.lineId, {
          candidateId: input.candidateId,
          unitPrice: input.unitPrice,
          sourceUnit: input.sourceUnit,
          matchedMaterialName: input.matchedMaterialName,
          matchedSpecification: input.matchedSpecification,
          evidenceQuote: input.evidenceQuote,
          confidence: input.confidence,
          rationale: input.rationale,
          differences: input.differences
        }), null, 2), {
          name: 'xpert_quotation_recommend_knowledge_price',
          description: 'Persist one AI recommendation after comparing current knowledge candidates against the quotation material name, full project-feature/specification, and unit. candidateId must come from the latest search for this line, and evidenceQuote must be an exact selected-chunk excerpt containing the unit price. This recommends only; it never confirms or writes Excel.',
          schema: knowledgeRecommendationSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.markKnowledgeNoMatch(
          scope,
          input.quotationId,
          input.lineId,
          input.reviewedCandidateIds,
          input.rationale
        ), null, 2), {
          name: 'xpert_quotation_mark_knowledge_no_match',
          description: 'For a kind=material row only, persist that every current knowledge candidate was reviewed and none defensibly matches the material specification or has a deterministically convertible unit. Pass every current candidate id exactly once before web fallback.',
          schema: knowledgeNoMatchSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.recommendWebPrice(scope, input.quotationId, input.lineId, {
          unitPrice: input.unitPrice,
          sourceUnit: input.sourceUnit,
          currency: input.currency,
          confidence: input.confidence,
          rationale: input.rationale,
          sources: input.sources
        }), null, 2), {
          name: 'xpert_quotation_recommend_web_price',
          description: 'Persist an evidence-backed web price only for an unmatched material row after knowledgebase search and a persisted no-match decision. Call web_search first, preserve the quotation unit, provide 1-5 unique HTTP(S) sources with explicit price excerpts, and use CNY. This recommends only; it never confirms or writes Excel.',
          schema: webPriceRecommendationSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => JSON.stringify(await this.service.applyQuotation(
          scope,
          input.quotationId,
          input.changeSummary,
          input.lineId,
          { overwriteExisting: input.overwriteExisting, expectedVersionNumber: input.expectedVersionNumber }
        ), null, 2), {
          name: 'xpert_quotation_apply_patch',
          description: 'Apply newly approved prices after explicit user approval. If target cells contain data, the first call returns overwrite_required without writing. Ask the user to confirm overwrite, then retry once with overwriteExisting=true and the returned expectedVersionNumber. Unresolved rows remain untouched and final totals are written only after every row is resolved or skipped.',
          schema: applySchema,
          verboseParsingErrors: true
        })
      ]
    const toolsByName = new Map(tools.map((item) => [item.name, item]))
    const selectedTools = toolNames.map((toolName) => {
      const selected = toolsByName.get(toolName)
      if (!selected) throw new Error(`Xpert Quotation middleware tool is not registered: ${toolName}`)
      return selected
    })

    return {
      name,
      ...(includeWorkbenchContext ? { contextSchema: quotationWorkbenchRequestContextSchema } : {}),
      tools: selectedTools
    }
  }
}

function quotationMiddlewareMeta(
  name: string,
  label: TAgentMiddlewareMeta['label'],
  description: TAgentMiddlewareMeta['description']
): TAgentMiddlewareMeta {
  return {
    name,
    label,
    icon: { type: 'svg', value: XPERT_QUOTATION_ICON },
    description,
    features: [XPERT_QUOTATION_FEATURE, XPERT_QUOTATION_PATCH_CAPABILITY],
    configSchema: { type: 'object', properties: {} }
  }
}

@Injectable()
@AgentMiddlewareStrategy(XPERT_QUOTATION_COORDINATOR_MIDDLEWARE_NAME)
export class XpertQuotationCoordinatorMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = quotationMiddlewareMeta(
    XPERT_QUOTATION_COORDINATOR_MIDDLEWARE_NAME,
    { en_US: 'Xpert Quotation Coordinator', zh_Hans: 'Xpert报价主流程' },
    {
      en_US: 'Inspect and match quotation workbooks, review persisted evidence, calculate approved rates, and apply confirmed workbook patches.',
      zh_Hans: '识别并匹配报价工作簿，审核已持久化证据，计算经确认的综合单价，并执行用户批准的工作簿写回。'
    }
  )

  constructor(private readonly factory: XpertQuotationMiddlewareFactory) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return this.factory.createMiddleware(
      XPERT_QUOTATION_COORDINATOR_MIDDLEWARE_NAME,
      XPERT_QUOTATION_COORDINATOR_TOOL_NAMES,
      context,
      true
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(XPERT_QUOTATION_LINE_WORKER_MIDDLEWARE_NAME)
export class XpertQuotationLineWorkerMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = quotationMiddlewareMeta(
    XPERT_QUOTATION_LINE_WORKER_MIDDLEWARE_NAME,
    { en_US: 'Xpert Quotation Line Proposal', zh_Hans: 'Xpert报价逐行提案' },
    {
      en_US: 'Persist the selected quota breakdown for one quotation line without retrieving knowledge or approving pricing.',
      zh_Hans: '仅持久化单条报价清单的定额拆分提案，不检索知识库、不审核计价。'
    }
  )

  constructor(private readonly factory: XpertQuotationMiddlewareFactory) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return this.factory.createMiddleware(
      XPERT_QUOTATION_LINE_WORKER_MIDDLEWARE_NAME,
      XPERT_QUOTATION_LINE_WORKER_TOOL_NAMES,
      context,
      false
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(XPERT_QUOTATION_CONSUMPTION_MIDDLEWARE_NAME)
export class XpertQuotationConsumptionMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = quotationMiddlewareMeta(
    XPERT_QUOTATION_CONSUMPTION_MIDDLEWARE_NAME,
    { en_US: 'Xpert Quotation Consumption Retrieval', zh_Hans: 'Xpert报价消耗量检索' },
    {
      en_US: 'Search only the consumption-quota knowledgebase connected to the current retrieval Agent.',
      zh_Hans: '仅检索当前消耗量 Agent 直属连接的消耗量定额知识库。'
    }
  )

  constructor(private readonly factory: XpertQuotationMiddlewareFactory) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return this.factory.createMiddleware(
      XPERT_QUOTATION_CONSUMPTION_MIDDLEWARE_NAME,
      XPERT_QUOTATION_CONSUMPTION_TOOL_NAMES,
      context,
      false
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(XPERT_QUOTATION_PRICE_MIDDLEWARE_NAME)
export class XpertQuotationPriceMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = quotationMiddlewareMeta(
    XPERT_QUOTATION_PRICE_MIDDLEWARE_NAME,
    { en_US: 'Xpert Quotation Price Retrieval', zh_Hans: 'Xpert报价价格检索' },
    {
      en_US: 'Search the price knowledgebase connected to the current retrieval Agent and persist bounded price recommendations.',
      zh_Hans: '检索当前价格 Agent 直属连接的价格知识库，并持久化有界的价格推荐。'
    }
  )

  constructor(private readonly factory: XpertQuotationMiddlewareFactory) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return this.factory.createMiddleware(
      XPERT_QUOTATION_PRICE_MIDDLEWARE_NAME,
      XPERT_QUOTATION_PRICE_TOOL_NAMES,
      context,
      false
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(XPERT_QUOTATION_MIDDLEWARE_NAME)
export class XpertQuotationMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = {
    ...quotationMiddlewareMeta(
      XPERT_QUOTATION_MIDDLEWARE_NAME,
      { en_US: 'Xpert Quotation (Legacy)', zh_Hans: 'Xpert报价（兼容）' },
      {
        en_US: 'Legacy all-in-one quotation middleware retained temporarily for existing Assistant graphs. Use the role-specific providers for new graphs.',
        zh_Hans: '为现有 Assistant 图暂时保留的全量兼容中间件；新图应使用按职责拆分的 provider。'
      }
    ),
    deprecated: true,
    deprecationMessage: {
      en_US: 'Migrate the Agent to one of the role-specific Xpert Quotation middleware providers.',
      zh_Hans: '请将 Agent 迁移到按职责拆分的 Xpert 报价中间件。'
    }
  } satisfies TAgentMiddlewareMeta

  constructor(private readonly factory: XpertQuotationMiddlewareFactory) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return this.factory.createMiddleware(
      XPERT_QUOTATION_MIDDLEWARE_NAME,
      XPERT_QUOTATION_TOOL_NAMES,
      context,
      true
    )
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): XpertScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null
  }
}

function readQuotationWorkbenchRuntimeContext(config: unknown): QuotationWorkbenchRuntimeContext {
  const runtimeConfig = config as {
    context?: Record<string, unknown>
    configurable?: { context?: Record<string, unknown> }
  } | undefined
  const context = runtimeConfig?.context && typeof runtimeConfig.context === 'object'
    ? runtimeConfig.context
    : runtimeConfig?.configurable?.context && typeof runtimeConfig.configurable.context === 'object'
      ? runtimeConfig.configurable.context
      : {}
  const parsed = quotationWorkbenchRequestContextSchema.safeParse(context)
  return parsed.success ? parsed.data.xpert_quotation_workbench ?? {} : {}
}
