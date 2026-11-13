import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import {
  APP_ICON,
  FEATURE,
  MIDDLEWARE_NAME,
  TOOL_GET_ANALYSIS,
  TOOL_MARK_FAILED,
  TOOL_SAVE_RESULT
} from './constants.js'
import { ResumeMatchService } from './analysis.service.js'
import { analysisIdSchema, markFailedSchema, saveMatchResultSchema } from './schemas.js'
import { toolScope } from './scope.js'

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class ResumeMatchMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: {
      en_US: '简历智能匹配',
      zh_Hans: '简历智能匹配'
    },
    description: {
      en_US: '读取待分析简历并保存可人工复核的匹配结论。',
      zh_Hans: '读取待分析简历并保存可人工复核的匹配结论。'
    },
    icon: {
      type: 'svg',
      value: APP_ICON,
      color: '#5b5bd6'
    },
    features: [FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: ResumeMatchService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = toolScope(context)

    const getAnalysisTool = tool(
      async (input: { analysisId: string }) => {
        const record = await this.service.readForAssistant(scope, input.analysisId)
        return JSON.stringify({
          success: true,
          message: '已读取分析材料。请严格依据岗位说明和简历完成判断。',
          data: record
        })
      },
      {
        name: TOOL_GET_ANALYSIS,
        description:
          '读取一条待分析记录中的岗位说明、简历、候选人信息和当前分析轮次。必须先调用本工具，再依据材料评分；不得编造材料中没有的信息。',
        schema: analysisIdSchema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Read analysis materials', zh_Hans: '读取分析材料' } }
      }
    )

    const saveResultTool = tool(
      async (input: Parameters<ResumeMatchService['saveResult']>[1]) => {
        const record = await this.service.saveResult(scope, input)
        return JSON.stringify({
          success: true,
          message: '匹配结论已写入工作台，等待招聘负责人人工确认。',
          data: {
            analysisId: record.id,
            status: record.status,
            revision: record.revision,
            overallScore: record.result?.overallScore,
            level: record.result?.level,
            candidateName: record.candidateName,
            jobTitle: record.jobTitle
          }
        })
      },
      {
        name: TOOL_SAVE_RESULT,
        description:
          '一次性保存四个维度的评分、能力覆盖、匹配理由、风险和建议。必须在读取材料并完成判断后调用；analysisId 与 attempt 必须原样传入。该工具只生成待人工确认结果，不会代替人确认。',
        schema: saveMatchResultSchema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Save analysis draft', zh_Hans: '保存分析草稿' } }
      }
    )

    const markFailedTool = tool(
      async (input: { analysisId: string; attempt: number; reason: string }) => {
        const record = await this.service.markFailed(
          scope,
          input.analysisId,
          input.attempt,
          input.reason
        )
        return JSON.stringify({
          success: true,
          message: '已记录分析失败原因，招聘负责人可以在工作台重试。',
          data: { analysisId: record.id, status: record.status, attempt: record.attempt }
        })
      },
      {
        name: TOOL_MARK_FAILED,
        description:
          '当材料无法读取、内容明显不足或无法形成可靠判断时，记录失败原因供招聘负责人重试。正常完成分析时不要调用。',
        schema: markFailedSchema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Record analysis failure', zh_Hans: '记录分析失败' } }
      }
    )

    return {
      name: MIDDLEWARE_NAME,
      tools: [getAnalysisTool, saveResultTool, markFailedTool]
    }
  }
}
