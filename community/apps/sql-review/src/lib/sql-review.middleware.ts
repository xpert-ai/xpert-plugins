import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  SQL_REVIEW_FEATURE,
  SQL_REVIEW_GET_CASE_TOOL_NAME,
  SQL_REVIEW_GET_RULE_FINDINGS_TOOL_NAME,
  SQL_REVIEW_ICON,
  SQL_REVIEW_MIDDLEWARE_NAME,
  SQL_REVIEW_SAVE_AI_REPORT_TOOL_NAME,
  SQL_REVIEW_SUBMIT_CASE_TOOL_NAME
} from './constants'
import { SqlReviewService, SqlReviewScope } from './sql-review.service'

const submitCaseSchema = z.object({
  sqlText: z.string().min(1).max(100_000).describe('The SQL statement to review, exactly as written by the developer.'),
  ddlContext: z
    .string()
    .max(50_000)
    .optional()
    .describe('Optional CREATE TABLE / index DDL of involved tables, helps grounding index findings.'),
  dbDialect: z.enum(['postgresql', 'mysql']).describe('Target database dialect.'),
  title: z.string().max(120).optional().describe('Optional short case title. Defaults to a generated one.')
})

const getRuleFindingsSchema = z.object({
  caseNo: z.string().min(1).describe('Case number of the submitted SQL review case.')
})

const aiFindingSchema = z.object({
  source: z.literal('ai').describe('Must be "ai" for analyst-produced findings.'),
  category: z.enum(['index', 'scan', 'spec', 'perf', 'injection', 'correctness']).describe('Finding category.'),
  severity: z.enum(['high', 'medium', 'low']).describe('Finding severity.'),
  location: z.string().max(200).describe('Where in the SQL, e.g. "line 3, WHERE clause".'),
  originalText: z.string().max(500).describe('Quoted SQL fragment this finding is about (evidence).'),
  explanation: z.string().max(2000).describe('Why this is a problem, plain language for the developer.'),
  suggestion: z.string().max(2000).describe('Concrete rewrite or action suggestion.')
})

const saveAiReportSchema = z.object({
  caseNo: z.string().min(1).describe('Case number the report belongs to.'),
  summary: z.string().min(1).max(2000).describe('Overall review summary in 2-4 sentences.'),
  confidence: z.number().min(0).max(1).describe('Analyst confidence in the overall report, 0 to 1.'),
  findings: z.array(aiFindingSchema).max(30).describe('AI findings beyond deterministic rules. Empty array allowed.')
})

const getCaseSchema = z.object({
  caseNo: z.string().min(1).describe('Case number to inspect.')
})

@AgentMiddlewareStrategy(SQL_REVIEW_MIDDLEWARE_NAME)
@Injectable()
export class SqlReviewMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: SQL_REVIEW_MIDDLEWARE_NAME,
    label: { en_US: 'SQL Review', zh_Hans: 'SQL 质量审查' },
    description: {
      en_US: 'Deterministic rule scan plus AI-assisted structured SQL review, saved for human confirmation.',
      zh_Hans: '确定性规则扫描 + AI 结构化 SQL 审查，结果保存供人工逐条确认。'
    },
    icon: { type: 'svg', value: SQL_REVIEW_ICON, color: '#0f766e' },
    features: [SQL_REVIEW_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  constructor(private readonly service: SqlReviewService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope: SqlReviewScope = {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      assistantId: context.xpertId
    }
    const operatorId = context.userId

    const submitCaseTool = tool(
      async (input: z.infer<typeof submitCaseSchema>) => {
        try {
          const result = await this.service.submitCase({
            scope,
            sqlText: input.sqlText,
            ddlContext: input.ddlContext,
            dbDialect: input.dbDialect,
            title: input.title,
            sourceType: 'agent_chat',
            createdById: operatorId,
            conversationId: context.conversationId
          })
          return JSON.stringify({
            success: true,
            message: `Case ${result.caseNo} submitted. Deterministic rule scan finished.`,
            data: {
              caseNo: result.caseNo,
              ruleFindingCount: result.ruleFindings.length,
              ruleFindings: result.ruleFindings.map((f) => ({
                ruleId: f.ruleId,
                severity: f.severity,
                category: f.category,
                location: f.location,
                evidence: f.originalText
              }))
            }
          })
        } catch (error) {
          return failure('submit case', error)
        }
      },
      {
        name: SQL_REVIEW_SUBMIT_CASE_TOOL_NAME,
        description:
          'Submit one SQL statement for review. Runs deterministic rules immediately and returns their findings so the analyst can cite them. Returns the caseNo used by the other tools.',
        schema: submitCaseSchema
      }
    )

    const getRuleFindingsTool = tool(
      async (input: z.infer<typeof getRuleFindingsSchema>) => {
        try {
          const findings = await this.service.getRuleFindings(scope, input.caseNo)
          return JSON.stringify({
            success: true,
            data: { caseNo: input.caseNo, findings }
          })
        } catch (error) {
          return failure('get rule findings', error)
        }
      },
      {
        name: SQL_REVIEW_GET_RULE_FINDINGS_TOOL_NAME,
        description:
          'Read the deterministic rule findings already stored for a case. Use before writing the AI report so every rule finding is cited rather than duplicated or contradicted.',
        schema: getRuleFindingsSchema
      }
    )

    const saveAiReportTool = tool(
      async (input: z.infer<typeof saveAiReportSchema>) => {
        try {
          const snapshot = await this.service.saveAiReport(scope, input.caseNo, {
            summary: input.summary,
            confidence: input.confidence,
            findings: input.findings.map((f) => ({
              source: 'ai' as const,
              category: f.category,
              severity: f.severity,
              location: f.location,
              originalText: f.originalText,
              explanation: f.explanation,
              suggestion: f.suggestion
            }))
          })
          return JSON.stringify({
            success: true,
            message: `AI report saved for case ${input.caseNo}. Status is now pending_confirmation; a human reviewer confirms each finding in the SQL Review workbench.`,
            data: { caseNo: snapshot.caseNo, status: snapshot.status, findingCount: snapshot.findings.length }
          })
        } catch (error) {
          return failure('save ai report', error)
        }
      },
      {
        name: SQL_REVIEW_SAVE_AI_REPORT_TOOL_NAME,
        description:
          'Persist the structured AI review report for a submitted case. Findings must quote evidence from the SQL text. After this call the case waits for human confirmation; do not claim the SQL is approved.',
        schema: saveAiReportSchema
      }
    )

    const getCaseTool = tool(
      async (input: z.infer<typeof getCaseSchema>) => {
        try {
          const snapshot = await this.service.getCaseSnapshot(scope, input.caseNo)
          return JSON.stringify({ success: true, data: snapshot })
        } catch (error) {
          return failure('get case', error)
        }
      },
      {
        name: SQL_REVIEW_GET_CASE_TOOL_NAME,
        description: 'Fetch the full snapshot of a review case (SQL, status, rule and AI findings, decisions).',
        schema: getCaseSchema
      }
    )

    return {
      name: SQL_REVIEW_MIDDLEWARE_NAME,
      tools: [submitCaseTool, getRuleFindingsTool, saveAiReportTool, getCaseTool]
    }
  }
}

function failure(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return JSON.stringify({
    success: false,
    error: `sql review: ${action} failed: ${message}`,
    hint: 'If the case is in failed status, it can be retried from the workbench; rule findings are preserved.'
  })
}
