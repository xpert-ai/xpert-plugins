import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  BLOG_AI_HELPER_FEATURE,
  BLOG_AI_HELPER_ICON,
  BLOG_AI_HELPER_MIDDLEWARE_NAME
} from './constants.js'
import { BlogAiHelperService } from './blog-ai-helper.service.js'
import type { BlogAiHelperScope } from './types.js'

const saveAnalysisSchema = z.object({
  recordId: z.string().min(1).describe('博客文章处理记录 id。'),
  summary: z.string().min(1).describe('用 2-3 句中文概括文章核心观点的摘要。'),
  tags: z.array(z.string().min(1)).default([]).describe('3-6 个中文标签。'),
  titleSuggestions: z
    .array(z.string().min(1))
    .default([])
    .describe('3-5 个备选标题。'),
  errorMessage: z.string().optional().describe('可选：处理失败的原因；填写后记录标记为失败。')
})

const reportFailureSchema = z.object({
  recordId: z.string().min(1).describe('博客文章处理记录 id。'),
  errorMessage: z.string().min(1).describe('处理失败原因说明。')
})

@Injectable()
@AgentMiddlewareStrategy(BLOG_AI_HELPER_MIDDLEWARE_NAME)
export class BlogAiHelperMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: BLOG_AI_HELPER_MIDDLEWARE_NAME,
    label: {
      en_US: 'Blog Article AI Helper',
      zh_Hans: '博客文章AI智能助手'
    },
    icon: {
      type: 'svg',
      value: BLOG_AI_HELPER_ICON
    },
    description: {
      en_US: 'Save AI-generated article summary, tags, and title suggestions to the blog article workbench.',
      zh_Hans: '把 AI 生成的文章摘要、标签和备选标题保存到博客文章工作台。'
    },
    features: [BLOG_AI_HELPER_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: BlogAiHelperService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: BLOG_AI_HELPER_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => JSON.stringify(await this.service.saveAnalysis(scope, input)),
          {
            name: 'blog_save_analysis',
            description:
              '保存 AI 为文章草稿生成的摘要、标签与备选标题。分析完文章后必须调用本工具，将 recordId、summary、tags、titleSuggestions 一并保存。',
            schema: saveAnalysisSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportFailure(scope, input.recordId, input.errorMessage)),
          {
            name: 'blog_report_failure',
            description: '文章处理失败时调用，保存失败原因，便于用户重试。',
            schema: reportFailureSchema,
            verboseParsingErrors: true
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): BlogAiHelperScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    assistantId: context.xpertId ?? null
  }
}
