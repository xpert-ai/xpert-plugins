import { Injectable } from '@nestjs/common'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  WorkspaceFilesApi,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  CONCERN_CATEGORIES,
  CONVERSATION_REVIEW_CHECK_RULES_TOOL_NAME,
  CONVERSATION_REVIEW_FEATURE,
  CONVERSATION_REVIEW_FETCH_CONVERSATIONS_TOOL_NAME,
  CONVERSATION_REVIEW_GET_HISTORY_TOOL_NAME,
  CONVERSATION_REVIEW_GET_RECORD_TOOL_NAME,
  CONVERSATION_REVIEW_GET_STATS_TOOL_NAME,
  CONVERSATION_REVIEW_ICON,
  CONVERSATION_REVIEW_IMPORT_CONVERSATIONS_TOOL_NAME,
  CONVERSATION_REVIEW_MIDDLEWARE_NAME,
  CONVERSATION_REVIEW_REPORT_FAILURE_TOOL_NAME,
  CONVERSATION_REVIEW_SAVE_ANALYSIS_TOOL_NAME,
  CONVERSATION_REVIEW_SCREENSHOT_ALLOWED_EXTENSIONS,
  CONVERSATION_REVIEW_SCREENSHOT_ALLOWED_MIME_TYPES,
  CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGE_BYTES,
  CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES,
  CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY,
  CONVERSATION_REVIEW_SCREENSHOT_SYSTEM_PROMPT,
  CONVERSATION_REVIEW_SEARCH_CUSTOMER_TOOL_NAME,
  CUSTOMER_HISTORY_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_MAX_LIMIT,
  CUSTOMER_SEARCH_DEFAULT_LIMIT,
  CUSTOMER_SEARCH_MAX_LIMIT,
  ISSUE_SEVERITIES,
  RISK_CATEGORIES
} from './constants'
import { detectImportFormat, parseConversations, parseExcelConversations } from './conversation-import'
import { ConversationReviewService, labelSkipped, mergeImportResults } from './conversation-review.service'
import { checkDeterministicRisks, mergeDeterministicRisks } from './rule-check'
import type {
  ConversationImportResult,
  ConversationImportRow,
  ConversationImportSkip,
  ConversationIssue,
  ConversationIssueSeverity,
  ConversationReviewScope,
  SaveAnalysisInput
} from './types'

/**
 * `recordId` is optional in every tool schema below: `wrapToolCall` fills it in from the record
 * silently synced via `assistant.context.set` when a call omits it, so the model normally never
 * needs to know or state the id at all. It only has to be passed explicitly when the model is
 * juggling more than one record in the same turn (e.g. citing history) — see RECORD_ID_HINT.
 */
const RECORD_ID_HINT =
  ' Usually omit this — it resolves automatically to the record currently open in the workbench.'

const getRecordSchema = z.object({
  recordId: z.string().min(1).optional().describe(`Customer conversation review record id.${RECORD_ID_HINT}`)
})

const checkRulesSchema = z.object({
  recordId: z
    .string()
    .min(1)
    .optional()
    .describe(`The record currently under review, same recordId as conversation_review_get_record.${RECORD_ID_HINT}`)
})

const getHistorySchema = z.object({
  recordId: z
    .string()
    .min(1)
    .optional()
    .describe(
      `The record currently under review. The customer is resolved from this record, so you never pass a customer name — and the record itself is excluded from the result.${RECORD_ID_HINT}`
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CUSTOMER_HISTORY_MAX_LIMIT)
    .optional()
    .describe(
      `How many previous conversations to read back, most recent first. Defaults to ${CUSTOMER_HISTORY_DEFAULT_LIMIT}. Ask for more only when the reply says more confirmed conversations exist and you are tracking a commitment across several of them.`
    )
})

/**
 * Issues are classified rather than free text. The enum is what the model actually sees, so this
 * schema — not the prompt — is the real guarantee that the dashboard can aggregate the output.
 * `evidence` is required: an unquoted classification cannot be checked by the salesperson, and a
 * number on the dashboard that nobody can trace back to a sentence is not worth showing.
 */
function issueSchema<C extends readonly [string, ...string[]]>(categories: C, what: string) {
  return z.object({
    category: z.enum(categories).describe(`Which ${what} bucket this belongs to. Use "other" only when none of the listed buckets fit.`),
    severity: z.enum(ISSUE_SEVERITIES).describe('How much this matters for winning the deal.'),
    detail: z.string().min(1).describe('One short sentence stating the issue, in the user\'s language.'),
    evidence: z
      .string()
      .min(1)
      .describe('Verbatim quote from the conversation that this classification is based on. Do not paraphrase.')
  })
}

const score = (what: string) => z.number().int().min(0).max(100).describe(what)

/**
 * The QC scorecard. Every axis is scored so that a higher number is better, including compliance,
 * because a radar chart with one inverted axis cannot be read at a glance.
 *
 * A dimension the conversation never touched scores low rather than being omitted: in a sales
 * review, not asking about budget at all IS a weak call, and an optional field would let the model
 * quietly skip the dimensions it found hard.
 */
const scoresSchema = z
  .object({
    needDiscovery: score('0-100. How well the salesperson uncovered the customer real needs, use case and scale.'),
    budgetHandling: score('0-100. How well budget and price objections were explored and answered with substance.'),
    decisionMapping: score('0-100. How well the decision makers, approval process and timeline were established.'),
    objectionHandling: score('0-100. How well the customer stated concerns were addressed with concrete, checkable answers.'),
    nextStepClarity: score('0-100. How clear, specific and mutually agreed the next step is. A call ending with "I will get back to you" scores low.'),
    complianceRisk: score(
      '0-100 where HIGH MEANS SAFE. 100 = no over-promising, every commitment qualified or already confirmed. Low = the salesperson promised delivery dates, discounts or capabilities that were not confirmed. This must agree with what you reported under risks.'
    )
  })
  .describe(
    'Six-dimension QC scorecard for this conversation. Score what the conversation actually shows; a dimension that never came up scores low, it is not skipped.'
  )

const saveAnalysisSchema = z.object({
  recordId: z
    .string()
    .min(1)
    .optional()
    .describe(`The same record id that was passed to conversation_review_get_record.${RECORD_ID_HINT}`),
  intentLevel: z
    .enum(['high', 'medium', 'low', 'unknown'])
    .describe('Customer buying intent judged from this conversation only. Use unknown when the text does not support a judgement.'),
  summary: z.string().min(1).describe('Short factual summary of what was discussed. Required.'),
  scores: scoresSchema,
  requirements: z.array(z.string()).optional().describe('Concrete customer requirements stated in the conversation.'),
  concerns: z
    .array(issueSchema(CONCERN_CATEGORIES, 'customer concern'))
    .optional()
    .describe('Customer hesitations or objections, each classified and quoted. Report one entry per distinct concern.'),
  risks: z
    .array(issueSchema(RISK_CATEGORIES, 'salesperson wording risk'))
    .optional()
    .describe('Risky expressions by the salesperson, each classified and quoted — over-promising, vague commitments, unconfirmed delivery promises. Reminders only, never legal or compliance conclusions.'),
  missingInformation: z
    .array(z.string())
    .optional()
    .describe('Important information that is still unconfirmed. Put anything you could not determine here instead of guessing.'),
  carriedOver: z
    .array(z.string())
    .optional()
    .describe(
      'Items left open by a PREVIOUS confirmed conversation with this customer that this conversation still did not close — a follow-up that was promised and has still not happened, a question the customer is now asking again, information that was unconfirmed last time and remains unconfirmed. Base this only on what conversation_review_get_customer_history returned, name which earlier conversation it came from, and leave it empty when there is no history or nothing was left open. Problems that first appear in this conversation belong in concerns, risks or missingInformation, not here.'
    ),
  nextActions: z
    .array(z.string())
    .optional()
    .describe('Specific, executable follow-up actions for the salesperson. Must not commit anything to the customer on their behalf.')
})

const reportFailureSchema = z.object({
  recordId: z.string().min(1).optional().describe(`Customer conversation review record id.${RECORD_ID_HINT}`),
  reason: z
    .string()
    .min(1)
    .describe('Plain-language reason the analysis could not be produced, understandable by a salesperson. For example: the conversation is too short to judge intent.')
})

/** No parameters: always answers over every record the current seller can see. */
const getStatsSchema = z.object({})

/** No parameters: always replays the same bundled connector fixtures as the workbench button. */
const fetchConversationsSchema = z.object({})

const importConversationsSchema = z.object({
  content: z
    .string()
    .min(1)
    .optional()
    .describe(
      'File content to import. For json/csv: the plain text content, exactly as it would be pasted or read from disk. For excel: the raw file bytes, base64-encoded. Omit this entirely when the salesperson attached the file (or a WeChat chat screenshot) directly to this chat message — for a screenshot, calling with no content queues it and the image is attached to your very next turn; look at it, reconstruct the single-party dialogue, then call this tool again with content set to {"customerName": "...", "conversation": "客户：...\\n销售：...", "occurredAt": "..."} as JSON text and format "json". Group-chat screenshots are not supported — say so instead of guessing.'
    ),
  format: z
    .enum(['json', 'csv', 'excel'])
    .optional()
    .describe('The file format. Omit it and pass fileName instead to let the extension decide.'),
  fileName: z
    .string()
    .optional()
    .describe('Original file name, e.g. "conversations.xlsx". Used to infer format when format is omitted.')
})

const searchCustomerSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Customer name or partial name to look up, exactly as the salesperson said it.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CUSTOMER_SEARCH_MAX_LIMIT)
    .optional()
    .describe(`How many distinct matching customers to return, most recently active first. Defaults to ${CUSTOMER_SEARCH_DEFAULT_LIMIT}.`)
})

@Injectable()
@AgentMiddlewareStrategy(CONVERSATION_REVIEW_MIDDLEWARE_NAME)
export class ConversationReviewMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: CONVERSATION_REVIEW_MIDDLEWARE_NAME,
    label: {
      en_US: 'Customer Conversation Review',
      zh_Hans: '客户沟通质检'
    },
    description: {
      en_US: 'Read a filed customer conversation, save a structured QC and follow-up analysis for human confirmation.',
      zh_Hans: '读取已归档的客户沟通记录，保存结构化质检与跟进建议，交由销售人工确认。'
    },
    icon: {
      type: 'svg',
      value: CONVERSATION_REVIEW_ICON,
      color: '#1d4ed8'
    },
    features: [CONVERSATION_REVIEW_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: ConversationReviewService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    /**
     * Reading workspace bytes is a genuinely new integration for this plugin — see the
     * `conversation_review_import_conversations` tool below and the README "已知限制" entry it
     * links to. `context.runtime.capabilities` is the fixed, per-invocation-agnostic registry
     * (unlike the per-turn `request.runtime` used elsewhere in this file for the current record),
     * so it is captured once here rather than re-resolved per tool call.
     */
    const workspaceFiles: WorkspaceFilesApi | undefined = context.runtime?.capabilities?.get(WorkspaceFilesRuntimeCapability)

    const getRecordTool = tool(
      async (input: z.infer<typeof getRecordSchema>) => {
        const record = await this.service.getRecordForAgent(scope, input.recordId ?? '')
        return JSON.stringify({
          success: true,
          message: 'Customer conversation record was returned.',
          data: record
        })
      },
      {
        name: CONVERSATION_REVIEW_GET_RECORD_TOOL_NAME,
        description:
          'Read one filed customer conversation, including the full original text. Call this first, before analysing, so the analysis is based on the stored conversation rather than on the chat message.',
        schema: getRecordSchema,
        verboseParsingErrors: true
      }
    )

    const getHistoryTool = tool(
      async (input: z.infer<typeof getHistorySchema>) => {
        const history = await this.service.getCustomerHistory(scope, input.recordId ?? '', input.limit)
        return JSON.stringify({
          success: true,
          message: history.totalConfirmed
            ? `Found ${history.totalConfirmed} earlier confirmed conversation(s) with ${history.customerName}; ${history.records.length} returned, most recent first.`
            : `No earlier confirmed conversation with ${history.customerName}. This is the first one — that is normal, continue the analysis and leave carriedOver empty.`,
          data: history
        })
      },
      {
        name: CONVERSATION_REVIEW_GET_HISTORY_TOOL_NAME,
        description:
          'Read previous conversations with the same customer that the salesperson has already reviewed and confirmed. Call this after conversation_review_get_record and before saving, so the analysis can say whether a commitment has slipped again or a question is being asked for the second time — things the conversation text alone cannot show. Returns only human-confirmed conversations, so unreviewed AI output is never treated as settled fact. An empty result means this is the first conversation with the customer; it is not a failure and must not be reported as one.',
        schema: getHistorySchema,
        verboseParsingErrors: true
      }
    )

    const checkRulesTool = tool(
      async (input: z.infer<typeof checkRulesSchema>) => {
        const record = await this.service.getRecordForAgent(scope, input.recordId ?? '')
        const hits = checkDeterministicRisks(record.conversation)
        return JSON.stringify({
          success: true,
          message: hits.length
            ? `Found ${hits.length} deterministic risk-phrase hit(s). Merge every one into risks — do not drop them and do not report the same evidence sentence twice.`
            : 'No deterministic pattern matched. This only means none of the fixed phrase checks fired — keep judging risks yourself from the conversation.',
          data: { risks: hits }
        })
      },
      {
        name: CONVERSATION_REVIEW_CHECK_RULES_TOOL_NAME,
        description:
          'Run deterministic, model-independent keyword/phrase checks for common salesperson wording risks (over-promising, vague commitments, unconfirmed delivery, unauthorized discounts, unverified claims) over the stored conversation text. Call this after conversation_review_get_record and before conversation_review_save_analysis. These are a backstop, not a replacement for your own judgement: merge every returned hit into risks, and still report any additional risk the fixed patterns did not catch. Even if you skip this call, the saved record will still include these deterministic hits.',
        schema: checkRulesSchema,
        verboseParsingErrors: true
      }
    )

    const saveAnalysisTool = tool(
      async (input: z.infer<typeof saveAnalysisSchema>) => {
        const record0 = await this.service.getRecordForAgent(scope, input.recordId ?? '')
        const ruleHits = checkDeterministicRisks(record0.conversation)
        // Restate recordId so the zod-inferred optional property satisfies the required field.
        // wrapToolCall guarantees it is set by the time this handler runs.
        const payload: SaveAnalysisInput = {
          ...input,
          recordId: input.recordId ?? '',
          concerns: toIssues(input.concerns),
          // Applied unconditionally so the persisted risks are the same regardless of whether the
          // model called conversation_review_check_rules itself — see mergeDeterministicRisks.
          risks: mergeDeterministicRisks(toIssues(input.risks), ruleHits)
        }
        const record = await this.service.saveAiResult(scope, payload)
        return JSON.stringify({
          success: true,
          message: 'Analysis saved. The salesperson must still review and confirm it in the workbench.',
          data: {
            id: record.id,
            status: record.status,
            customerName: record.customerName,
            intentLevel: record.intentLevel,
            summary: record.aiResult?.summary,
            nextActions: record.aiResult?.nextActions
          }
        })
      },
      {
        name: CONVERSATION_REVIEW_SAVE_ANALYSIS_TOOL_NAME,
        description:
          'Save the structured QC and follow-up analysis for one conversation. Call exactly once per record, after conversation_review_get_record. This result is a draft for human review, not the final business result — do not claim the record is confirmed.',
        schema: saveAnalysisSchema,
        verboseParsingErrors: true
      }
    )

    const reportFailureTool = tool(
      async (input: z.infer<typeof reportFailureSchema>) => {
        const record = await this.service.markFailed(scope, input.recordId ?? '', input.reason)
        return JSON.stringify({
          success: true,
          message: 'Failure recorded. The salesperson can retry from the workbench.',
          data: {
            id: record.id,
            status: record.status,
            errorMessage: record.errorMessage,
            retryCount: record.retryCount
          }
        })
      },
      {
        name: CONVERSATION_REVIEW_REPORT_FAILURE_TOOL_NAME,
        description:
          'Report that the conversation cannot be analysed — for example it is too short, unrelated to a sales conversation, or lacks any usable information. Use this instead of inventing an analysis. The record moves to failed and the salesperson can retry.',
        schema: reportFailureSchema,
        verboseParsingErrors: true
      }
    )

    const getStatsTool = tool(
      async () => {
        const stats = await this.service.getStatsForAgent(scope)
        return JSON.stringify({
          success: true,
          message: `${stats.totalRecords} record(s) across ${stats.totalCustomers} customer(s).`,
          data: stats
        })
      },
      {
        name: CONVERSATION_REVIEW_GET_STATS_TOOL_NAME,
        description:
          'Get team-level aggregate statistics: total customers and records, status breakdown, intent distribution, top customer-concern and salesperson-risk categories, six-dimension score averages, recent daily trend, activityToday, and how often the salesperson changed the AI result before confirming it. Use this for big-picture questions ("how many customers", "what is blocking deals lately", "has the AI been accurate") — never for questions about one specific conversation, which conversation_review_get_record answers instead. IMPORTANT: for "how many records were uploaded/imported/touched today", use insights.activityToday (createdToday/updatedToday), NOT insights.trend — trend is bucketed by occurredAt (when the conversation happened) so a bulk import of old conversations shows 0 for today even though records were just created.',
        schema: getStatsSchema,
        verboseParsingErrors: true
      }
    )

    const searchCustomerTool = tool(
      async (input: z.infer<typeof searchCustomerSchema>) => {
        const result = await this.service.searchCustomers(scope, input.query, input.limit)
        return JSON.stringify({
          success: true,
          message: !result.matches.length
            ? `No customer matched "${result.query}".`
            : result.matches.length > 1 || result.totalMatches > result.matches.length
              ? `${result.totalMatches} distinct customer(s) matched "${result.query}" — this is ambiguous, list them and ask which one before doing anything else.`
              : `Exactly one customer matched "${result.query}".`,
          data: result
        })
      },
      {
        name: CONVERSATION_REVIEW_SEARCH_CUSTOMER_TOOL_NAME,
        description:
          'Look up customers by name or partial name when the salesperson asks about one by name instead of having a record open, for example "怎么样了 华东精密制造" or "上次跟老王那家谈得怎么样". Matches by substring, so a partial or misremembered name still finds candidates. If more than one distinct customer matches, you MUST list them (name, record count, latest status/date) and ask the salesperson which one they mean — never guess or pick the most recent one silently, and never state a raw recordId in your reply; refer to records by customer name, date and status instead. If exactly one customer matches, you may proceed, for example by calling conversation_review_get_record with its most recent recordId.',
        schema: searchCustomerSchema,
        verboseParsingErrors: true
      }
    )

    const fetchConversationsTool = tool(
      async () => {
        const result = await this.service.simulateFetchConversations(scope)
        return JSON.stringify({
          success: true,
          message: `Simulated connector fetch imported ${result.imported} conversation(s)${
            result.duplicates ? `, skipped ${result.duplicates} duplicate(s)` : ''
          }${result.skipped.length ? `, ${result.skipped.length} row(s) could not be imported` : ''}. Every one lands as a draft — analysis is not triggered automatically.`,
          data: result
        })
      },
      {
        name: CONVERSATION_REVIEW_FETCH_CONVERSATIONS_TOOL_NAME,
        description:
          'Fetch recent customer conversations from the archive connector, exactly like clicking "获取聊天会话记录" in the workbench toolbar — same bundled connector sources, same parsing and import path, no parameters. Use this when the salesperson asks in chat to pull in or sync the latest conversations. Imported conversations land as drafts; call conversation_review_get_stats or list_pending afterwards, and analysis still has to be requested separately per record.',
        schema: fetchConversationsSchema,
        verboseParsingErrors: true
      }
    )

    const importConversationsTool = tool(
      async (input: z.infer<typeof importConversationsSchema>) => {
        // `wrapToolCall` below tries to resolve chat-attached files first and only calls this
        // handler when that did not apply or did not find anything — see resolveChatAttachmentImport.
        if (!input.content) {
          return JSON.stringify({
            success: false,
            message:
              'No file content was provided, and no chat attachment could be resolved for this call. Ask the salesperson to attach the file again, paste its content directly as content, or use "选择文件导入" in the workbench.'
          })
        }
        const format = input.format ?? detectImportFormat(input.fileName)
        if (format !== 'json' && format !== 'csv' && format !== 'excel') {
          return JSON.stringify({
            success: false,
            message: `Could not determine the file format${
              input.fileName ? ` from "${input.fileName}"` : ''
            }. Pass format explicitly as one of json/csv/excel, or a fileName ending in .json/.csv/.xlsx.`
          })
        }
        const parsed: { rows: ConversationImportRow[]; skipped: ConversationImportSkip[] } =
          format === 'excel'
            ? parseExcelConversations(Buffer.from(input.content, 'base64'))
            : parseConversations(input.content, format)
        const result = await this.service.importConversations(scope, parsed.rows, `import:${format}`, parsed.skipped)
        return JSON.stringify({
          success: true,
          message: buildImportToolMessage(result),
          data: result
        })
      },
      {
        name: CONVERSATION_REVIEW_IMPORT_CONVERSATIONS_TOOL_NAME,
        description:
          'Import a batch of conversations, in the same json/csv/excel shapes the workbench file picker accepts, or reconstruct one from a WeChat chat screenshot attached to this message. If the salesperson attached the file directly to this chat message, call this with NO arguments at all (or just format/fileName as a hint) — a json/csv/excel attachment is resolved and imported automatically; a screenshot attachment (png/jpg/jpeg/webp) is instead queued and shown to you on the next turn so you can reconstruct the dialogue and call this tool again with the reconstructed content (see the content parameter for the exact shape). Only single-party (one customer, one salesperson) screenshots are supported — refuse a group-chat screenshot instead of guessing. Otherwise pass content yourself: plain text for json/csv, base64-encoded bytes for excel. Every row lands as a draft, exactly like the workbench import — analysis is never triggered automatically by import.',
        schema: importConversationsSchema,
        verboseParsingErrors: true
      }
    )

    return {
      name: CONVERSATION_REVIEW_MIDDLEWARE_NAME,
      tools: [
        getRecordTool,
        getHistoryTool,
        checkRulesTool,
        saveAnalysisTool,
        reportFailureTool,
        getStatsTool,
        searchCustomerTool,
        fetchConversationsTool,
        importConversationsTool
      ],
      wrapModelCall: async (request, handler) => {
        const currentRecord = resolveCurrentRecord(request.runtime)
        const screenshotMessage = await resolvePendingScreenshotInjection(request.messages, request.runtime, workspaceFiles)

        if (!currentRecord && !screenshotMessage) {
          return handler(request)
        }

        let systemMessage = request.systemMessage
        if (currentRecord) {
          systemMessage = appendSystemMessage(systemMessage, buildCurrentRecordSystemPrompt(currentRecord))
        }
        if (screenshotMessage) {
          systemMessage = appendSystemMessage(systemMessage, CONVERSATION_REVIEW_SCREENSHOT_SYSTEM_PROMPT)
        }

        return handler({
          ...request,
          systemMessage,
          ...(screenshotMessage ? { messages: [...request.messages, screenshotMessage] } : {})
        })
      },
      wrapToolCall: async (request, handler) => {
        if (request.toolCall.name === CONVERSATION_REVIEW_IMPORT_CONVERSATIONS_TOOL_NAME) {
          const args = isRecord(request.toolCall.args) ? request.toolCall.args : {}
          if (!getString(args['content'])) {
            const attachmentResult = await resolveChatAttachmentImport(this.service, scope, request.runtime, workspaceFiles)
            if (attachmentResult) {
              return new ToolMessage({
                content: JSON.stringify(attachmentResult),
                tool_call_id: request.toolCall.id ?? 'unknown',
                name: request.toolCall.name,
                status: attachmentResult.success ? 'success' : 'error',
                ...(attachmentResult.pendingScreenshot
                  ? { metadata: { [CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY]: true } }
                  : {})
              })
            }
            // No chat attachment either — fall through so the tool's own handler returns its
            // "no content provided" message, worded for the model rather than duplicated here.
          }
          return handler(request)
        }

        if (!CONTEXTUAL_TOOL_NAMES.has(request.toolCall.name)) {
          return handler(request)
        }

        const args = isRecord(request.toolCall.args) ? request.toolCall.args : {}
        const explicitRecordId = getString(args['recordId'])
        const currentRecord = resolveCurrentRecord(request.runtime)
        const recordId = explicitRecordId ?? currentRecord?.recordId
        if (!recordId) {
          return new ToolMessage({
            content: MISSING_RECORD_CONTEXT_MESSAGE,
            tool_call_id: request.toolCall.id ?? 'unknown',
            name: request.toolCall.name,
            status: 'error'
          })
        }

        return handler({
          ...request,
          toolCall: { ...request.toolCall, args: { ...args, recordId } }
        })
      }
    }
  }
}

// ------------------------------------------------------------- silent record context
//
// Mirrors the `assistant.context.set` pattern used by docx-editor / excalidraw / story-studio:
// the remote component hands the current record to the Assistant on a channel that never renders
// as a chat bubble, so `buildAnalysisMessage` can stay plain language and the salesperson never
// has to see or supply `recordId`.

type RuntimeContextRecord = Record<string, unknown>

type CurrentConversationRecord = {
  recordId: string
  customerName?: string
  status?: string
}

const CONTEXTUAL_TOOL_NAMES = new Set<string>([
  CONVERSATION_REVIEW_GET_RECORD_TOOL_NAME,
  CONVERSATION_REVIEW_GET_HISTORY_TOOL_NAME,
  CONVERSATION_REVIEW_CHECK_RULES_TOOL_NAME,
  CONVERSATION_REVIEW_SAVE_ANALYSIS_TOOL_NAME,
  CONVERSATION_REVIEW_REPORT_FAILURE_TOOL_NAME
])

const MISSING_RECORD_CONTEXT_MESSAGE =
  '未找到当前工作台记录，请先在工作台里选中或提交一条记录，或者显式传 recordId。'

function buildCurrentRecordSystemPrompt(record: CurrentConversationRecord) {
  const lines = [
    'Current conversation review workbench record (set silently via assistant.context.set, not from the visible chat message):',
    `- recordId: ${record.recordId}`,
    record.customerName ? `- customerName: ${record.customerName}` : null,
    record.status ? `- status: ${record.status}` : null,
    'Conversation review tools may omit recordId when operating on this record.'
  ]
  return lines.filter(Boolean).join('\n')
}

function appendSystemMessage(systemMessage: unknown, addition: string) {
  const content =
    typeof systemMessage === 'string'
      ? systemMessage
      : systemMessage instanceof SystemMessage && typeof systemMessage.content === 'string'
        ? systemMessage.content
        : isRecord(systemMessage) && typeof systemMessage['content'] === 'string'
          ? (systemMessage['content'] as string)
          : ''

  return new SystemMessage([content, addition].filter(Boolean).join('\n\n'))
}

/**
 * `key: 'conversationReview'` on the `assistant.context.set` payload lands here as
 * `runtimeContext.conversationReview.currentRecord`; the flat `env.conversationReviewRecordId`
 * is the fallback for hosts that only forward `env`. Both are populated by the remote component's
 * `syncAssistantContext` (see `app.js`) — see that file for the payload shape.
 */
function resolveCurrentRecord(runtime: unknown): CurrentConversationRecord | null {
  const runtimeContext = resolveRuntimeContext(runtime)
  const reviewContext = getRecord(runtimeContext, 'conversationReview')
  const currentRecord = getRecord(reviewContext, 'currentRecord')
  const env = getRecord(runtimeContext, 'env')
  const recordId = getString(currentRecord?.['recordId']) ?? getString(env?.['conversationReviewRecordId'])

  if (!recordId) {
    return null
  }

  return {
    recordId,
    customerName: getString(currentRecord?.['customerName']),
    status: getString(currentRecord?.['status'])
  }
}

function resolveRuntimeContext(runtime: unknown): RuntimeContextRecord | null {
  if (!isRecord(runtime)) {
    return null
  }

  const directContext = getRecord(runtime, 'context')
  if (directContext) {
    return directContext
  }

  return getRecord(getRecord(runtime, 'configurable'), 'context')
}

function getRecord(record: unknown, key: string): RuntimeContextRecord | null {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is RuntimeContextRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// ------------------------------------------------- chat-attached file import (see README §6)
//
// `humanInput.files` arrives through the exact same `runtime.context` channel as
// `assistant.context.set` above (see `resolveRuntimeContext`) — the platform puts the chat
// attachment's reference there whenever the salesperson drags a file straight into the chat
// input, distinct from this plugin's own `import_conversations` view action file picker. Nothing
// in the platform has exercised turning that reference into bytes before this, so every step here
// degrades to a plain-language message instead of throwing: the workbench file picker is always
// the fallback.

function resolveHumanInputFiles(runtime: unknown): RuntimeContextRecord[] {
  const runtimeContext = resolveRuntimeContext(runtime)
  const humanInput = getRecord(runtimeContext, 'humanInput')
  const files = humanInput?.['files']
  return Array.isArray(files) ? files.filter(isRecord) : []
}

function buildImportToolMessage(result: ConversationImportResult) {
  return `Imported ${result.imported} conversation(s)${
    result.duplicates ? `, skipped ${result.duplicates} duplicate(s)` : ''
  }${result.skipped.length ? `, ${result.skipped.length} row(s) could not be imported` : ''}. Every one lands as a draft — analysis is not triggered automatically.`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function fileLabel(file: RuntimeContextRecord): string | undefined {
  return getString(file['name']) ?? getString(file['originalName']) ?? getString(file['fileName'])
}

// ------------------------------------------------- WeChat screenshot import (see README §6, TODO.md D)
//
// A screenshot attachment does not go through `conversation-import.ts`'s deterministic parsers —
// there is no fixed structure to parse, the model has to look at the image and reconstruct the
// dialogue itself. So this tool call does not import anything: it validates and acks, tagging the
// `ToolMessage` with `CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY` so `wrapModelCall` can
// detect it on the very next model step and inject the image there (same `image_url` content-block
// pattern the platform's `view-image` middleware uses). The model then reconstructs the
// conversation text and calls `conversation_review_import_conversations` a second time with that
// text as `content` — that second call is the existing, unmodified json import path.
//
// Bytes are re-read from `humanInput.files` twice (once here to validate, once in `wrapModelCall`
// to inject) instead of being cached, because `humanInput.files` is turn-scoped runtime context —
// unlike `view-image`'s sandbox-path lookups, it should still be readable on the next model call
// without needing an in-memory batch cache with its own TTL/eviction concerns.

function isScreenshotFileName(name: string | undefined): boolean {
  if (!name) {
    return false
  }
  const lower = name.trim().toLowerCase()
  return CONVERSATION_REVIEW_SCREENSHOT_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Sniffs PNG/JPEG/WEBP from magic bytes — same three formats `view-image` accepts. */
function detectScreenshotMimeType(buffer: Buffer): (typeof CONVERSATION_REVIEW_SCREENSHOT_ALLOWED_MIME_TYPES)[number] | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

async function resolveScreenshotAttachment(
  screenshotFiles: RuntimeContextRecord[],
  otherFileCount: number,
  workspaceFiles: WorkspaceFilesApi
): Promise<{ success: boolean; message: string; pendingScreenshot?: boolean }> {
  if (screenshotFiles.length > CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES) {
    return {
      success: false,
      message: `一次最多支持 ${CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES} 张截图，本次附加了 ${screenshotFiles.length} 张。请分批发送，或减少截图数量。`
    }
  }

  const failures: string[] = []
  let validCount = 0

  for (const file of screenshotFiles) {
    const label = fileLabel(file) ?? 'screenshot'
    try {
      const resolved = await workspaceFiles.readRuntimeBuffer(file as never)
      if (resolved.buffer.byteLength > CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGE_BYTES) {
        failures.push(`${label}：超过 ${Math.round(CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGE_BYTES / (1024 * 1024))}MB 大小上限`)
        continue
      }
      if (!detectScreenshotMimeType(resolved.buffer)) {
        failures.push(`${label}：不是受支持的图片格式（仅支持 PNG/JPEG/WEBP）`)
        continue
      }
      validCount += 1
    } catch (error) {
      failures.push(`${label}：${getErrorMessage(error)}`)
    }
  }

  if (!validCount) {
    return {
      success: false,
      message: `无法读取附加的截图（${failures.join('；')}）。请重新发送，或使用工作台文件导入。`
    }
  }

  return {
    success: true,
    pendingScreenshot: true,
    message:
      `已加载 ${validCount} 张微信聊天截图${
        failures.length ? `（另有 ${failures.length} 张读取失败：${failures.join('；')}）` : ''
      }${otherFileCount ? `。本次只处理截图，另外 ${otherFileCount} 个非图片附件未处理，请单独发送` : ''}` +
      '。请查看截图内容，按单聊对话重建文本，然后再次调用本工具并传入重建后的 content（JSON 格式）完成导入。'
  }
}

/**
 * Re-reads the same `humanInput.files` reference used to queue the screenshot, this time to build
 * the `image_url` content blocks for the next model call. Returns `null` whenever there is nothing
 * to inject — no pending marker, no files, nothing readable — so the caller falls back to a plain
 * model call rather than surfacing a half-built message.
 */
async function resolvePendingScreenshotInjection(
  messages: unknown[],
  runtime: unknown,
  workspaceFiles: WorkspaceFilesApi | undefined
): Promise<HumanMessage | null> {
  if (!workspaceFiles || !hasPendingScreenshotMarker(messages)) {
    return null
  }

  const files = resolveHumanInputFiles(runtime).filter((file) => isScreenshotFileName(fileLabel(file)))
  if (!files.length) {
    return null
  }

  const items: { fileName: string; mimeType: string; dataUrl: string }[] = []
  const failures: string[] = []

  for (const file of files.slice(0, CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES)) {
    const label = fileLabel(file) ?? 'screenshot'
    try {
      const resolved = await workspaceFiles.readRuntimeBuffer(file as never)
      if (resolved.buffer.byteLength > CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGE_BYTES) {
        failures.push(`${label}：超过大小上限`)
        continue
      }
      const mimeType = detectScreenshotMimeType(resolved.buffer)
      if (!mimeType) {
        failures.push(`${label}：不受支持的图片格式`)
        continue
      }
      items.push({
        fileName: resolved.name || label,
        mimeType,
        dataUrl: `data:${mimeType};base64,${resolved.buffer.toString('base64')}`
      })
    } catch (error) {
      failures.push(`${label}：${getErrorMessage(error)}`)
    }
  }

  if (!items.length) {
    return null
  }

  return new HumanMessage({
    content: [
      {
        type: 'text',
        text: `以下 ${items.length} 张微信聊天截图已加载：${items.map((item) => item.fileName).join('、')}。${
          failures.length ? `另有 ${failures.length} 张未能重新读取（${failures.join('；')}），按已加载的截图继续。` : ''
        }`
      },
      ...items.map((item) => ({
        type: 'image_url' as const,
        image_url: { url: item.dataUrl, detail: 'low' as const }
      }))
    ]
  })
}

function hasPendingScreenshotMarker(messages: unknown[]): boolean {
  const last = messages[messages.length - 1]
  if (!(last instanceof ToolMessage)) {
    return false
  }
  const metadata = last.metadata
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      (metadata as Record<string, unknown>)[CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY] === true
  )
}

/**
 * Returns `null` when there is nothing to do here (no chat attachment on this turn) so the caller
 * falls through to the tool's own "no content provided" handler. Returns a result object — success
 * or not — once an attachment was found, so a resolution failure is reported back to the model
 * instead of silently falling through to a more confusing error.
 */
async function resolveChatAttachmentImport(
  service: ConversationReviewService,
  scope: ConversationReviewScope,
  runtime: unknown,
  workspaceFiles: WorkspaceFilesApi | undefined
): Promise<{ success: boolean; message: string; data?: ConversationImportResult; pendingScreenshot?: boolean } | null> {
  const files = resolveHumanInputFiles(runtime)
  if (!files.length) {
    return null
  }
  if (!workspaceFiles) {
    return {
      success: false,
      message:
        'This chat message appears to have a file attached, but reading chat-attachment bytes is not available in this environment. Ask the salesperson to use "选择文件导入" in the workbench instead, or paste the file content directly.'
    }
  }

  const screenshotFiles = files.filter((file) => isScreenshotFileName(fileLabel(file)))
  if (screenshotFiles.length) {
    return resolveScreenshotAttachment(screenshotFiles, files.length - screenshotFiles.length, workspaceFiles)
  }

  const results: ConversationImportResult[] = []
  const failures: string[] = []

  for (const file of files) {
    const label = getString(file['name']) ?? getString(file['originalName']) ?? getString(file['fileName']) ?? 'attachment'
    try {
      const resolved = await workspaceFiles.readRuntimeBuffer(file as never)
      const fileName = resolved.name || label
      const format = detectImportFormat(fileName)
      if (format !== 'json' && format !== 'csv' && format !== 'excel') {
        failures.push(`${fileName}: unrecognized file type`)
        continue
      }
      const parsed =
        format === 'excel' ? parseExcelConversations(resolved.buffer) : parseConversations(resolved.buffer.toString('utf8'), format)
      const imported = await service.importConversations(scope, parsed.rows, `import:${format}`, parsed.skipped)
      results.push({ ...imported, skipped: labelSkipped(imported.skipped, fileName) })
    } catch (error) {
      failures.push(`${label}: ${getErrorMessage(error)}`)
    }
  }

  if (!results.length) {
    return {
      success: false,
      message: `Could not read any of the ${files.length} chat attachment(s)${
        failures.length ? ` (${failures.join('; ')})` : ''
      }. Ask the salesperson to use the workbench file picker instead, or paste the content directly.`
    }
  }

  const merged = mergeImportResults(results)
  return {
    success: true,
    message: `${buildImportToolMessage(merged)}${
      failures.length ? ` ${failures.length} attachment(s) could not be read: ${failures.join('; ')}.` : ''
    }`,
    data: merged
  }
}

/**
 * This package compiles without `strictNullChecks`, under which zod infers every object key as
 * optional. Restate the required fields so the tool payload lines up with `ConversationIssue`;
 * the defaults here never really apply, because the schema already rejects a missing category.
 */
function toIssues(
  value: { category?: string; severity?: string; detail?: string; evidence?: string }[] | undefined
): ConversationIssue[] | undefined {
  return value?.map((item) => ({
    category: item.category ?? 'other',
    severity: (item.severity ?? 'medium') as ConversationIssueSeverity,
    detail: item.detail,
    evidence: item.evidence,
    source: 'model' as const
  }))
}

function scopeFromContext(context: IAgentMiddlewareContext): ConversationReviewScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
