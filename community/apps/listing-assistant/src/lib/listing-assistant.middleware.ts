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
  LISTING_ASSISTANT_FEATURE,
  LISTING_ASSISTANT_MIDDLEWARE_NAME,
  LISTING_ICON
} from './constants.js'
import { ListingAssistantService } from './listing-assistant.service.js'
import type { ListingDraftInput, ListingScope, ListingSpecInput } from './types.js'

type CreateTaskInput = { sourceText: string }
type TaskIdInput = { taskId: string }
type SaveDraftInput = ListingDraftInput & { taskId: string; specs?: ListingSpecInput[] | null }

type PluginAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type PluginAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<unknown>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors?: boolean
  }
) => PluginAgentTool

/**
 * Keeps LangChain's overloaded tool() generics from contaminating the middleware return type.
 * Runtime validation still uses the real Zod schema passed at each call site.
 */
const defineAgentTool = tool as unknown as PluginAgentToolFactory

const specSchema = z.object({
  name: z.string().min(1).describe('Sellable variant name, such as a tier or duration.'),
  price: z.string().optional().describe('Variant price as text, without currency symbol.'),
  stock: z.number().int().min(0).optional().describe('Available stock for this variant.')
})

const createTaskSchema = z.object({
  sourceText: z.string().min(1).describe('Raw supplier copy to turn into a listing task.')
})

const taskIdSchema = z.object({
  taskId: z.string().min(1).describe('Listing task id from listing_create_task or the workbench.')
})

const saveDraftSchema = z.object({
  taskId: z.string().min(1).describe('Listing task id.'),
  title: z.string().optional().describe('Listing title confirmed by the user.'),
  description: z.string().optional().describe('Listing description confirmed by the user.'),
  price: z.string().optional().describe('Price as text, without currency symbol.'),
  currency: z.string().optional().describe('ISO currency code, for example CNY.'),
  category: z.string().optional().describe('Category name.'),
  attributes: z.record(z.union([z.string(), z.number(), z.null()])).optional().describe('Category attributes.'),
  specs: z.array(specSchema).optional().describe('Sellable variants.')
})

@Injectable()
@AgentMiddlewareStrategy(LISTING_ASSISTANT_MIDDLEWARE_NAME)
export class ListingAssistantMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: LISTING_ASSISTANT_MIDDLEWARE_NAME,
    label: {
      en_US: 'Listing Assistant',
      zh_Hans: '批量上架助手'
    },
    icon: {
      type: 'svg',
      value: LISTING_ICON
    },
    description: {
      en_US: 'Create listing tasks, run AI extraction, and save reviewed listing drafts for the workbench.',
      zh_Hans: '创建上架任务、执行 AI 抽取，并为工作台保存人工核对后的上架草稿。'
    },
    features: [LISTING_ASSISTANT_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: ListingAssistantService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: LISTING_ASSISTANT_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool(
          async (input: CreateTaskInput) => JSON.stringify(await this.service.createTask(scope, input), null, 2),
          {
            name: 'listing_create_task',
            description:
              'Create a listing task from raw supplier copy. Returns the new task id. Call listing_parse_task afterwards.',
            schema: createTaskSchema
          }
        ),
        defineAgentTool(
          async (input: TaskIdInput) => JSON.stringify(await this.service.getTask(scope, input.taskId), null, 2),
          {
            name: 'listing_get_task',
            description: 'Read one listing task with its source copy, draft, specs, status, and recent AI runs.',
            schema: taskIdSchema
          }
        ),
        defineAgentTool(
          async (input: TaskIdInput) => {
            try {
              const result = await this.service.parseTask(scope, input.taskId)
              return JSON.stringify({ ok: true, outcome: result.outcome, task: result.detail }, null, 2)
            } catch (error) {
              return JSON.stringify(
                {
                  ok: false,
                  errorCode: (error as { code?: string }).code ?? 'AI_CALL_FAILED',
                  errorMessage: error instanceof Error ? error.message : String(error)
                },
                null,
                2
              )
            }
          },
          {
            name: 'listing_parse_task',
            description:
              'Run AI extraction on one listing task. Idempotent: a task that already produced a draft is not parsed again.',
            schema: taskIdSchema
          }
        ),
        defineAgentTool(
          async (input: SaveDraftInput) =>
            JSON.stringify(await this.service.saveDraft(scope, input.taskId, input), null, 2),
          {
            name: 'listing_save_draft',
            description:
              'Save the human-confirmed listing draft for a task. Only submit values the user confirmed; omit unknown fields.',
            schema: saveDraftSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ListingScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    userId: context.userId,
    xpertId: context.xpertId ?? null
  }
}
