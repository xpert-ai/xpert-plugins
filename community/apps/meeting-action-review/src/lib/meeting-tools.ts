import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import { XpertTool, XpertToolProvider, type XpertBusinessToolContext } from '@xpert-ai/plugin-sdk'
import { AnalysisService } from './analysis.service.js'
import { FEATURE, MIDDLEWARE, NAMESPACE, SOURCE_TOOL, SUBMIT_TOOL } from './constants.js'
import { extractionSchema, type ExtractionInput } from './schemas.js'
import { fail, type ToolScope } from './types.js'

export function toolScope(context: XpertBusinessToolContext): ToolScope {
  const user = context.principal.userId
  if (context.surface !== 'middleware' || !context.organizationId || !user || !context.xpertId || !context.conversationId || !context.agentKey) fail('NO_ACTIVE_CONTEXT')
  return { tenantId: context.tenantId, organizationId: context.organizationId, ownerUserId: user,
    assistantId: context.xpertId, conversationId: context.conversationId, agentKey: context.agentKey }
}
@Injectable()
@XpertToolProvider({
  provider: `${NAMESPACE}_tools`, componentKey: `${NAMESPACE.replaceAll('_', '-')}-tools`, name: 'Meeting action review',
  defaultMiddleware: MIDDLEWARE,
  middlewares: [{ provider: MIDDLEWARE, meta: { name: MIDDLEWARE,
    label: { en_US: 'Meeting action review', zh_Hans: '会后行动项核对' },
    description: { en_US: 'Read the active meeting and submit evidence-linked extraction.', zh_Hans: '读取本次会议并提交带原文依据的提取结果。' },
    features: [FEATURE], configSchema: { type: 'object', properties: {}, required: [] }
  } }]
})
export class MeetingTools {
  constructor(private readonly analysis: AnalysisService) {}
  @XpertTool({ name: SOURCE_TOOL, title: 'Read meeting source',
    description: 'Read numbered source fragments for this authorized background analysis. No arguments. Ordinary chat without an active analysis is rejected; ask the user to create a meeting in the workbench.',
    inputSchema: z.object({}).strict(), middleware: true, mcp: false,
    metadata: { toolName: { en_US: 'Read meeting source', zh_Hans: '读取会议原文' }, verboseParsingErrors: true }
  })
  source(_input: Record<string, never>, context: XpertBusinessToolContext) { return this.analysis.source(toolScope(context)) }
  @XpertTool({ name: SUBMIT_TOOL, title: 'Submit extracted actions',
    description: 'Submit all explicit actions with task, nullable owner, nullable original deadlineText, sourceSegmentIds, optional reviewNote. [] means no actions. Reference only IDs returned by the source tool. This saves an AI draft, never human confirmation. Correct validation errors within this execution; stop after accepted=true.',
    inputSchema: extractionSchema, outputSchema: z.object({ accepted: z.boolean(), count: z.number() }),
    middleware: true, mcp: false,
    metadata: { toolName: { en_US: 'Submit extracted actions', zh_Hans: '提交行动项提取结果' }, verboseParsingErrors: true }
  })
  submit(input: ExtractionInput, context: XpertBusinessToolContext) { return this.analysis.submit(toolScope(context), input) }
}
