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
  SCRAPE_TASK_INTAKE_DETAIL_TOOL_NAME,
  SCRAPE_TASK_INTAKE_FEATURE,
  SCRAPE_TASK_INTAKE_GET_CATALOG_TOOL_NAME,
  SCRAPE_TASK_INTAKE_ICON,
  SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME,
  SCRAPE_TASK_INTAKE_SAVE_TOOL_NAME,
  SCRAPE_TASK_INTAKE_SEARCH_TOOL_NAME,
  SCRAPE_TASK_INTAKE_SUPPLEMENT_DRAFT_TOOL_NAME
} from './constants'
import { ScrapeTaskIntakeService } from './scrape-task-intake.service'
import type { ScrapeDataFieldSpec, ScrapeTaskGeneratedInput, ScrapeTaskScope } from './types'

const dataFieldSpecSchema: z.ZodType<ScrapeDataFieldSpec> = z
  .object({
    name: z.string().min(1).describe('Field display name, such as 商品名称 or 发布时间.'),
    description: z.string().optional().describe('What the field means.'),
    example: z.string().optional().describe('A realistic example value.'),
    required: z.boolean().optional().describe('Whether the field is mandatory for this task.')
  }) as z.ZodType<ScrapeDataFieldSpec>

const saveGeneratedTaskSchema = z.object({
  sourceType: z.enum(['agent_chat', 'workbench_form']).optional().describe('Source where the request was submitted.'),
  title: z.string().optional().describe('Generated task title.'),
  originalContent: z.string().min(1).describe('Original natural-language scraping request from the user.'),
  requesterName: z.string().optional().describe('Requester name, when provided.'),
  requesterDepartment: z.string().optional().describe('Requester department, when provided.'),
  requesterContact: z.string().optional().describe('Requester contact, when provided.'),
  targetUrl: z.string().optional().describe('Primary target URL of the site or page to collect.'),
  targetSite: z.string().optional().describe('Target site or platform name, such as 京东商品页.'),
  pagesScope: z.enum(['list', 'detail', 'search', 'full_site']).optional().describe('Which pages to crawl: list only, list+detail, search+detail, or full site traversal.'),
  dataFields: z.array(dataFieldSpecSchema).optional().describe('Structured list of fields to extract, with descriptions and examples.'),
  crawlFrequency: z.enum(['once', 'daily', 'weekly', 'monthly', 'manual']).optional().describe('How often the collection should run.'),
  deliveryFormat: z.enum(['csv', 'json', 'excel', 'database']).optional().describe('Expected delivery format.'),
  estimatedVolume: z.string().optional().describe('Estimated data volume, such as 约 1 万条以内.'),
  authRequired: z.boolean().optional().describe('Whether the target requires login credentials.'),
  priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority.'),
  antiBotNotes: z.string().optional().describe('Anti-bot risk hints: captcha, rate limits, TLS/JS fingerprint checks expected on the target.'),
  complianceNotes: z.string().optional().describe('Compliance notes: robots.txt, ToS, personal data or licensing concerns.'),
  completenessTips: z.array(z.string()).optional().describe('Missing or uncertain information the engineer must confirm.'),
  aiConfidence: z.number().min(0).max(1).optional().describe('AI confidence between 0 and 1.'),
  aiRawResult: z.unknown().optional().describe('Raw structured AI result for traceability.')
})

const getCatalogSchema = z.object({
  siteType: z.string().optional().describe('Optional site type key, such as ecommerce_product, to focus field templates.')
})

const searchTasksSchema = z.object({
  status: z.enum(['pending_confirmation', 'needs_supplement', 'confirmed', 'in_progress', 'completed', 'rejected']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority filter.'),
  search: z.string().optional().describe('Keyword used to search task number, title, content, target site or requester.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(50).optional().describe('Page size. Defaults to 10.')
})

const taskDetailSchema = z.object({
  taskId: z.string().min(1).describe('Scrape task id.')
})

const supplementDraftSchema = z.object({
  taskId: z.string().min(1).describe('Needs-supplement scrape task id.'),
  supplementContent: z.string().optional().describe('User natural-language supplement content.'),
  title: z.string().optional(),
  targetUrl: z.string().optional(),
  targetSite: z.string().optional(),
  pagesScope: z.enum(['list', 'detail', 'search', 'full_site']).optional(),
  dataFields: z.array(dataFieldSpecSchema).optional(),
  crawlFrequency: z.enum(['once', 'daily', 'weekly', 'monthly', 'manual']).optional(),
  deliveryFormat: z.enum(['csv', 'json', 'excel', 'database']).optional(),
  estimatedVolume: z.string().optional(),
  authRequired: z.boolean().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  antiBotNotes: z.string().optional(),
  complianceNotes: z.string().optional(),
  confidence: z.number().min(0).max(1).optional().describe('Draft confidence between 0 and 1.'),
  rationale: z.string().optional().describe('Short rationale for the supplement draft.')
})

@Injectable()
@AgentMiddlewareStrategy(SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME)
export class ScrapeTaskIntakeMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME,
    label: {
      en_US: 'Scrape Task Intake',
      zh_Hans: '采集需求受理'
    },
    description: {
      en_US: 'Save AI-generated scraping task specs for human review.',
      zh_Hans: '保存 AI 生成的采集任务书,供人工审核处理。'
    },
    icon: {
      type: 'svg',
      value: SCRAPE_TASK_INTAKE_ICON,
      color: '#0f766e'
    },
    features: [SCRAPE_TASK_INTAKE_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: ScrapeTaskIntakeService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const saveGeneratedTaskTool = tool(
      async (input: z.infer<typeof saveGeneratedTaskSchema>) => {
        const payload: ScrapeTaskGeneratedInput = {
          ...input,
          originalContent: input.originalContent
        }
        const task = await this.service.saveGeneratedTask(payload, scope)
        return JSON.stringify({
          success: true,
          message:
            task.status === 'needs_supplement'
              ? 'Scrape task spec was generated but needs human supplement before confirmation.'
              : 'Scrape task spec was generated for human review.',
          data: {
            id: task.id,
            taskNo: task.taskNo,
            status: task.status,
            title: task.title,
            targetSite: task.targetSite,
            targetUrl: task.targetUrl,
            priority: task.priority,
            dataFieldsCount: task.dataFields?.length ?? 0,
            completenessTips: task.completenessTips,
            aiConfidence: task.aiConfidence,
            deduplicated: Boolean(task.logs?.length && task.logs[0]?.action === 'dedupe_skipped')
          }
        })
      },
      {
        name: SCRAPE_TASK_INTAKE_SAVE_TOOL_NAME,
        description:
          'Save one AI-generated scraping task spec after extracting structured fields from a natural-language collection request. Use exactly once per request. Retrying the same request returns the earlier open task instead of creating a duplicate.',
        schema: saveGeneratedTaskSchema
      }
    )

    const getCatalogTool = tool(
      async (_input: z.infer<typeof getCatalogSchema>) => {
        const catalog = this.service.getCatalog()
        return JSON.stringify({
          success: true,
          message: 'Scrape task intake catalog was returned.',
          data: catalog
        })
      },
      {
        name: SCRAPE_TASK_INTAKE_GET_CATALOG_TOOL_NAME,
        description:
          'Get scrape task intake catalog: site type field templates, crawl frequencies, delivery formats, page scopes and a compliance checklist.',
        schema: getCatalogSchema
      }
    )

    const searchTasksTool = tool(
      async (input: z.infer<typeof searchTasksSchema>) => {
        const result = await this.service.searchTasks(scope, input)
        return JSON.stringify({
          success: true,
          message: 'Scrape tasks were searched.',
          data: result
        })
      },
      {
        name: SCRAPE_TASK_INTAKE_SEARCH_TOOL_NAME,
        description:
          'Search scrape task specs by status, keyword, priority with pagination. Use this when the user asks about existing scraping tasks or history.',
        schema: searchTasksSchema
      }
    )

    const getTaskDetailTool = tool(
      async (input: z.infer<typeof taskDetailSchema>) => {
        const detail = await this.service.getTaskDetailForAgent(scope, input.taskId)
        return JSON.stringify({
          success: true,
          message: 'Scrape task detail was returned.',
          data: detail
        })
      },
      {
        name: SCRAPE_TASK_INTAKE_DETAIL_TOOL_NAME,
        description:
          'Get one scrape task detail including AI extraction, human confirmation fields, supplement draft and operation logs.',
        schema: taskDetailSchema
      }
    )

    const prepareSupplementDraftTool = tool(
      async (input: z.infer<typeof supplementDraftSchema>) => {
        const { taskId, ...draftInput } = input
        const task = await this.service.prepareSupplementDraft(scope, taskId, draftInput)
        return JSON.stringify({
          success: true,
          message:
            'Scrape task supplement draft was saved. Ask the user to open the review desk, one-click fill the draft, and save manually.',
          data: {
            id: task.id,
            taskNo: task.taskNo,
            status: task.status,
            aiSupplementDraft: task.aiSupplementDraft,
            aiSupplementDraftedAt: task.aiSupplementDraftedAt
          }
        })
      },
      {
        name: SCRAPE_TASK_INTAKE_SUPPLEMENT_DRAFT_TOOL_NAME,
        description:
          'Prepare an AI supplement draft for a needs-supplement scrape task from user-provided supplement content. This does not confirm, reject, or close the task.',
        schema: supplementDraftSchema
      }
    )

    return {
      name: SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME,
      tools: [saveGeneratedTaskTool, getCatalogTool, searchTasksTool, getTaskDetailTool, prepareSupplementDraftTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ScrapeTaskScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
