import { tool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { BadRequestException, Injectable } from '@nestjs/common'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
  getToolCallIdFromConfig,
  type TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import {
  ActorTokenRuntimeCapability,
  AgentMiddlewareStrategy,
  RequestContext,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  VALVE_FEATURE,
  VALVE_ICON,
  VALVE_MIDDLEWARE_NAME,
  VALVE_TOOL_NAMES,
  VALVE_TOOL_TITLES
} from './constants'
import { readValveRuntimeContext, valveAssistantRequestContextSchema } from './runtime-context'
import type { ValveActorScope, ValveJsonObject, ValveProposalStatus, ValveToolResult } from './types'
import { ValveBusinessService } from './valve-business.service'

const emptySchema = z.object({}).strict()
const resourceInput = z.object({ resourceId: z.string().min(1).optional() }).strict()
const searchInput = z
  .object({
    resourceId: z.string().min(1).optional(),
    entityTypeCode: z.string().min(1).optional(),
    query: z.string().max(500).optional(),
    partitionKey: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict()
const object360Input = z
  .object({
    resourceId: z.string().min(1).optional(),
    partitionKey: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    entityTypeCode: z.string().min(1).optional(),
    entityRef: z.string().min(1).optional()
  })
  .strict()
const proposalStatusSchema = z.enum(['pending_review', 'approved', 'rejected', 'completed', 'failed'])
const listProposalsInput = z
  .object({
    resourceId: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    status: proposalStatusSchema.optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict()
const jsonValueSchema: z.ZodType<ValveJsonObject> = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))])
) as z.ZodType<ValveJsonObject>
const preflightActionInput = object360Input
  .extend({
    actionTypeCode: z.string().min(1).max(160),
    actionInput: jsonValueSchema.optional(),
    expectedGraphVersion: z.string().min(1).optional()
  })
  .strict()
const createProposalInput = z
  .object({
    operationId: z.string().min(1).max(160).optional(),
    changeSummary: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('Concise user-visible progress title describing the proposal being created.'),
    resourceId: z.string().min(1).optional(),
    partitionKey: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    entityTypeCode: z.string().min(1).optional(),
    entityRef: z.string().min(1).optional(),
    kind: z.enum(['ontology_action', 'engineering_review']),
    actionTypeCode: z.string().min(1).optional(),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(4000),
    expectedEffects: z.array(z.string().min(1).max(500)).max(20).optional(),
    evidence: jsonValueSchema.optional(),
    actionInput: jsonValueSchema.optional(),
    expectedGraphVersion: z.string().min(1).optional()
  })
  .strict()
const auditInput = z
  .object({
    proposalId: z.string().uuid().optional(),
    taskId: z.string().min(1).optional()
  })
  .strict()

@Injectable()
@AgentMiddlewareStrategy(VALVE_MIDDLEWARE_NAME)
export class ValveMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: VALVE_MIDDLEWARE_NAME,
    label: { en_US: 'Valve Business Workbench', zh_Hans: '阀门业务工作台' },
    description: {
      en_US: 'Read published valve ontology facts and create governed, reviewable action proposals.',
      zh_Hans: '读取已发布的阀门本体事实，并创建受控、可审核的动作草案。'
    },
    icon: { type: 'svg', value: VALVE_ICON, color: '#0f766e' },
    features: [VALVE_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  constructor(private readonly service: ValveBusinessService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: VALVE_MIDDLEWARE_NAME,
      contextSchema: valveAssistantRequestContextSchema,
      tools: [
        tool(
          async () => this.run(() => this.service.listResources(scope), 'RESOURCES_LISTED'),
          {
            name: VALVE_TOOL_NAMES.listResources,
            description: 'List ready published ontology resources whose schema contains the exact configured valve root entity type.',
            schema: emptySchema,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.listResources] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            const resourceId = this.resolveResourceId(input.resourceId, selected?.resourceId)
            const target = resolveTarget(input, selected)
            return this.run(
              () =>
                this.service.getAvailableActions(scope, {
                  resourceId,
                  partitionKey: resolvePartitionKey(input.partitionKey, selected, target),
                  target
                }),
              'ACTIONS_DISCOVERED'
            )
          },
          {
            name: VALVE_TOOL_NAMES.discoverActions,
            description:
              'Discover governed actions for the selected valve, including source, risk, required input, preconditions, expected effects, and Demo execution boundary.',
            schema: object360Input,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.discoverActions] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            const resourceId = this.resolveResourceId(input.resourceId, selected?.resourceId)
            const target = resolveTarget(input, selected)
            return this.run(
              () =>
                this.service.preflightAction(scope, {
                  resourceId,
                  partitionKey: resolvePartitionKey(input.partitionKey, selected, target),
                  target,
                  actionTypeCode: input.actionTypeCode,
                  actionInput: input.actionInput,
                  expectedGraphVersion: input.expectedGraphVersion ?? selected?.graphVersion
                }),
              'ACTION_PREFLIGHT_COMPLETED'
            )
          },
          {
            name: VALVE_TOOL_NAMES.preflightAction,
            description:
              'Validate one proposed valve action against the current object snapshot, required input, duplicate work, and Demo adapter availability. This performs no mutation.',
            schema: preflightActionInput,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.preflightAction] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            const resourceId = this.resolveResourceId(input.resourceId, selected?.resourceId)
            return this.run(() => this.service.getSchema(scope, resourceId), 'SCHEMA_RETURNED')
          },
          {
            name: VALVE_TOOL_NAMES.getSchema,
            description: 'Get the compact schema summary for a ready valve ontology resource.',
            schema: resourceInput,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.getSchema] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            const resourceId = this.resolveResourceId(input.resourceId, selected?.resourceId)
            return this.run(
              () =>
                this.service.searchObjects(scope, {
                  resourceId,
                  entityTypeCode: input.entityTypeCode,
                  query: input.query,
                  partitionKey: input.partitionKey ?? selected?.partitionKey,
                  limit: input.limit
                }),
              'OBJECTS_RETURNED'
            )
          },
          {
            name: VALVE_TOOL_NAMES.searchObjects,
            description: 'Search ontology objects with a bounded result limit. Defaults to the configured valve root entity type.',
            schema: searchInput,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.searchObjects] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            const resourceId = this.resolveResourceId(input.resourceId, selected?.resourceId)
            const target = resolveTarget(input, selected)
            return this.run(
              () =>
                this.service.getObject360(scope, {
                  resourceId,
                  partitionKey: resolvePartitionKey(input.partitionKey, selected, target),
                  target
                }),
              'OBJECT_360_RETURNED'
            )
          },
          {
            name: VALVE_TOOL_NAMES.getObject360,
            description: 'Get one object with its properties, one-hop relations, related objects, evidence, constraints, and available actions.',
            schema: object360Input,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.getObject360] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            return this.run(
              () =>
                this.service.listActionProposals(scope, {
                  resourceId: input.resourceId ?? selected?.resourceId,
                  entityId: input.entityId ?? selected?.entityId,
                  status: input.status as ValveProposalStatus | undefined,
                  limit: input.limit
                }),
              'PROPOSALS_RETURNED'
            )
          },
          {
            name: VALVE_TOOL_NAMES.listActionProposals,
            description: 'List reviewable valve action proposals, optionally scoped to the selected workbench object.',
            schema: listProposalsInput,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.listActionProposals] }
          }
        ),
        tool(
          async (input, config) => {
            const selected = readValveRuntimeContext(config)
            const resourceId = this.resolveResourceId(input.resourceId, selected?.resourceId)
            const target = resolveTarget(input, selected)
            const operationId = input.operationId ?? getToolCallIdFromConfig(config)
            if (!operationId) throw new BadRequestException('OPERATION_ID_REQUIRED')
            return this.run(
              () =>
                this.service.createActionProposal(scope, {
                  operationId,
                  resourceId,
                  partitionKey: resolvePartitionKey(input.partitionKey, selected, target),
                  target,
                  kind: input.kind,
                  actionTypeCode: input.actionTypeCode,
                  title: input.title,
                  summary: input.summary,
                  expectedEffects: input.expectedEffects,
                  evidence: input.evidence,
                  actionInput: input.actionInput,
                  expectedGraphVersion: input.expectedGraphVersion ?? selected?.graphVersion
                }),
              'PROPOSAL_CREATED'
            )
          },
          {
            name: VALVE_TOOL_NAMES.createActionProposal,
            description:
              'Create a pending-review proposal only when the user explicitly asks to save a recommendation. This never approves or executes an external action.',
            schema: createProposalInput,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.createActionProposal] }
          }
        ),
        tool(
          async (input) =>
            this.run(() => this.service.getAuditTrace(scope, input), 'AUDIT_TRACE_RETURNED'),
          {
            name: VALVE_TOOL_NAMES.getAuditTrace,
            description: 'Get local proposal decision events or a data-xpert read-tool audit trace.',
            schema: auditInput,
            verboseParsingErrors: true,
            metadata: { toolName: VALVE_TOOL_TITLES[VALVE_TOOL_NAMES.getAuditTrace] }
          }
        )
      ],
      wrapToolCall: async (request, handler) => {
        if (request.toolCall.name !== VALVE_TOOL_NAMES.createActionProposal) {
          return handler(request)
        }

        const changeSummary = readChangeSummary(request.toolCall.args)
        if (!changeSummary) {
          return handler(request)
        }

        const createdAt = new Date()
        const toolCallId = readString(request.toolCall.id) ?? `${request.toolCall.name}:${createdAt.getTime()}`
        await dispatchValveToolStepEvent({ request, toolCallId, changeSummary, status: 'running', createdAt })
        try {
          const result = await handler(request)
          await dispatchValveToolStepEvent({ request, toolCallId, changeSummary, status: 'success', createdAt })
          return result
        } catch (error) {
          await dispatchValveToolStepEvent({
            request,
            toolCallId,
            changeSummary,
            status: 'fail',
            createdAt,
            error: error instanceof Error ? error.message : 'Valve action proposal creation failed.'
          })
          throw error
        }
      }
    }
  }

  private resolveResourceId(explicit?: string, contextual?: string) {
    const configured = this.serviceConfigResourceId()
    const resolved = explicit ?? contextual ?? configured
    if (!resolved) throw new BadRequestException('NO_ACTIVE_CONTEXT')
    return resolved
  }

  private serviceConfigResourceId() {
    return this.service.defaultResourceId()
  }

  private async run<T>(operation: () => Promise<T>, code: string): Promise<string> {
    try {
      const data = await operation()
      return JSON.stringify({ ok: true, code, message: code, data } satisfies ValveToolResult<T>)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VALVE_TOOL_FAILED'
      return JSON.stringify({ ok: false, code: message, message } satisfies ValveToolResult<never>)
    }
  }
}

type ValveToolStepStatus = 'running' | 'success' | 'fail'

async function dispatchValveToolStepEvent({
  request,
  toolCallId,
  changeSummary,
  status,
  createdAt,
  error
}: {
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
  toolCallId: string
  changeSummary: string
  status: ValveToolStepStatus
  createdAt: Date
  error?: string
}) {
  const runtimeMetadata = request.runtime && typeof request.runtime === 'object'
    ? Reflect.get(request.runtime, 'metadata')
    : undefined
  const metadata = isRecord(runtimeMetadata) ? runtimeMetadata : {}
  const toolset = readString(metadata.toolset) ?? VALVE_MIDDLEWARE_NAME
  const toolsetId = readString(metadata.toolsetId)
  const event = {
    id: toolCallId,
    tool_call_id: request.toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset,
    ...(toolsetId ? { toolset_id: toolsetId } : {}),
    tool: request.toolCall.name,
    title: changeSummary,
    message: changeSummary,
    status,
    created_date: createdAt,
    input: stripChangeSummary(request.toolCall.args),
    ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
    ...(error ? { error } : {})
  }

  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, event)
  } catch {
    // Tool timeline events are observational and must never fail the proposal mutation.
  }
}

function readChangeSummary(value: unknown) {
  if (!isRecord(value)) return undefined
  return readString(value.changeSummary)
}

function stripChangeSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripChangeSummary(item))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'changeSummary')
      .map(([key, item]) => [key, stripChangeSummary(item)])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveTarget(
  input: { entityId?: string; entityTypeCode?: string; entityRef?: string },
  selected?: { entityId: string; entityTypeCode: string; externalKey: string }
) {
  if (
    selected &&
    ((!input.entityId && !input.entityRef) ||
      input.entityId === selected.entityId ||
      input.entityRef === selected.externalKey)
  ) {
    return { entityId: selected.entityId, entityTypeCode: selected.entityTypeCode, entityRef: selected.externalKey }
  }
  if (input.entityId || input.entityRef) {
    return { entityId: input.entityId, entityTypeCode: input.entityTypeCode, entityRef: input.entityRef }
  }
  if (!selected) throw new BadRequestException('NO_ACTIVE_CONTEXT')
  return { entityId: selected.entityId, entityTypeCode: selected.entityTypeCode, entityRef: selected.externalKey }
}

function resolvePartitionKey(
  explicit: string | undefined,
  selected: { entityId: string; externalKey: string; partitionKey?: string | null } | undefined,
  target: { entityId?: string; entityRef?: string }
) {
  const targetsSelectedObject =
    selected && (target.entityId === selected.entityId || target.entityRef === selected.externalKey)
  // partitionKey is an opaque routing value. When the tool addresses the active
  // Workbench object, only the host-published value is trusted (including an
  // intentionally absent partition); this prevents the model from inventing a
  // partition from snapshot/resource names and producing false 404 responses.
  return targetsSelectedObject ? selected.partitionKey ?? undefined : explicit ?? selected?.partitionKey ?? undefined
}

function scopeFromContext(context: IAgentMiddlewareContext): ValveActorScope {
  const actorTokenApi = context.runtime?.capabilities?.get(ActorTokenRuntimeCapability)
  return {
    tenantId: context.tenantId ?? RequestContext.currentTenantId(),
    organizationId:
      context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    userId: context.userId ?? RequestContext.currentUserId(),
    assistantId: context.xpertId,
    conversationId: context.conversationId,
    actorTokenProvider: actorTokenApi
      ? async () => {
          const result = await actorTokenApi.getToken({
            act: { sub: 'valve_business_workbench', middleware_node: context.node?.key }
          })
          return result.token
        }
      : undefined
  }
}
