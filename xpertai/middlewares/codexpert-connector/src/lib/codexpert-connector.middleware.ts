import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { getToolCallFromConfig, type TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext,
} from '@xpert-ai/plugin-sdk'
import { ChatMessageTypeEnum, type TMessageContentText } from '@xpert-ai/chatkit-types'
import { z } from 'zod/v3'
import {
  callCodexpertMcpTool,
  createCodexpertSession,
  streamCodexpertPrompt,
} from './codexpert-connector.client.js'
import { CodexpertConnectorRunService } from './codexpert-connector-run.service.js'
import {
  createProjectionState,
  flushVisibleCodexpertProjection,
  projectVisibleCodexpertEvent,
} from './codexpert-visible-projector.js'
import {
  CODEXPERT_AGENT_KEY,
  CODEXPERT_CONNECTOR_MIDDLEWARE_NAME,
  CODEXPERT_XPERT_NAME,
  CodexpertConnectorConfigSchema,
  RunCodexpertTaskInputSchema,
  type CodexpertConnectorConfig,
  type CodexpertConnectorEvent,
  type CodexpertTaskResult,
  type PrincipalContext,
  type RunCodexpertTaskInput,
} from './types.js'

const MCP_TOOL_NAMES = [
  'listCodingAssistants',
  'listCodexpertConversations',
  'listGitConnections',
  'listGitRepositories',
  'listGitBranches',
  'selectCodingContext',
  'resolveCodexpertConversationContext',
  'resumeCodexpertSession',
] as const

const passthroughToolSchema = z.record(z.string(), z.unknown()).optional().default({})

const CONNECTOR_DESCRIPTION =
  'Codexpert Connector lets the agent delegate real coding work to Codexpert while keeping the current user informed in chat. Use it when the user clearly asks to inspect, modify, implement, debug, or continue work in a code repository. First use the context tools to select or resume the coding assistant, Git connection, repository, branch, and coding session. Then call runCodexpertTask for actual coding execution. Codexpert owns repository preparation, coding environment reuse, task execution, and final coding output. Do not use this connector for general discussion, planning, configuration explanation, or status-only questions.'

const RUN_CODEXPERT_TASK_DESCRIPTION = [
  'Run a Codexpert coding task in the selected or resumed coding session.',
  'Use this only when the user wants Codexpert to actually perform or continue coding work, such as inspecting, modifying, implementing, debugging, or continuing a repository task.',
  'Before calling this tool, make sure the coding context is known. If codingSessionId or resumed task context is missing, first use listCodingAssistants, listGitConnections, listGitRepositories, listGitBranches, selectCodingContext, listCodexpertConversations, or resumeCodexpertSession as needed.',
  'During execution, Codexpert visible progress and output are streamed directly to the user. The agent should not restate or rewrite that live output unless the user asks.',
  'After the tool returns, use the metadata it returns, including status, codingSessionId, taskId, threadId, executionId, environmentId, summary, error, and prUrl, to decide whether to continue, recover, report a Codexpert-produced PR, or report failure.',
  'Do not call this tool for general discussion, planning, explanation, configuration questions, or status-only lookup.',
].join('\n')

function buildMcpToolDescription(toolName: string): string {
  return [
    `Call Codexpert MCP context tool ${toolName}.`,
    'Use Codexpert context tools before runCodexpertTask to identify or resume the coding assistant, Git connection, repository, branch, conversation, and coding session.',
    'The connector injects the service token and current business-user identity headers automatically.',
    'Do not use context tools as a substitute for runCodexpertTask when the user has already asked Codexpert to execute coding work.',
  ].join('\n')
}

@Injectable()
@AgentMiddlewareStrategy(CODEXPERT_CONNECTOR_MIDDLEWARE_NAME)
export class CodexpertConnectorMiddleware implements IAgentMiddlewareStrategy<Partial<CodexpertConnectorConfig>> {
  private readonly logger = new Logger(CodexpertConnectorMiddleware.name)

  readonly meta: TAgentMiddlewareMeta = {
    name: CODEXPERT_CONNECTOR_MIDDLEWARE_NAME,
    label: {
      en_US: 'Codexpert Connector',
      zh_Hans: 'Codexpert 连接器',
    },
    description: {
      en_US: CONNECTOR_DESCRIPTION,
      zh_Hans:
        'Codexpert 连接器让 Agent 把真实编码工作委托给 Codexpert，同时把 Codexpert 的可见进度和结果直接投影给当前用户。用户明确要求检查、修改、实现、调试或继续仓库代码任务时使用。先用上下文工具选择或恢复编码助手、Git 连接、仓库、分支和编码会话，再用 runCodexpertTask 执行真实编码任务。Codexpert 负责仓库准备、编码环境复用、任务执行和最终编码输出。不要把它用于普通讨论、规划、配置解释或只查询状态的问题。',
    },
    configSchema: {
      type: 'object',
      properties: {
        codexpertMcpUrl: { type: 'string', title: { en_US: 'Codexpert MCP URL', zh_Hans: 'Codexpert MCP 地址' } },
        codexpertConnectorBaseUrl: { type: 'string', title: { en_US: 'Connector Base URL', zh_Hans: 'Connector 基础地址' } },
        serviceToken: { type: 'string', title: { en_US: 'Service Token', zh_Hans: '服务令牌' } },
        timeoutMs: { type: 'number', default: 600000, title: { en_US: 'Timeout (ms)', zh_Hans: '超时时间 (ms)' } },
        enableVisibleProjection: { type: 'boolean', default: true, title: { en_US: 'Visible Projection', zh_Hans: '用户可见投影' } },
        enableStatusEvents: { type: 'boolean', default: true, title: { en_US: 'Status Events', zh_Hans: '状态事件' } },
        defaultXpertId: { type: 'string', title: { en_US: 'Default Coding Assistant', zh_Hans: '默认编码助手' } },
        defaultRepoId: { type: 'string', title: { en_US: 'Default Repository', zh_Hans: '默认仓库' } },
        defaultConnectionId: { type: 'string', title: { en_US: 'Default Git Connection', zh_Hans: '默认 Git 连接' } },
        defaultBranchName: { type: 'string', title: { en_US: 'Default Branch', zh_Hans: '默认分支' } },
      },
    },
  }

  constructor(private readonly runService: CodexpertConnectorRunService) {}

  createMiddleware(
    options: Partial<CodexpertConnectorConfig>,
    context: IAgentMiddlewareContext,
  ): PromiseOrValue<AgentMiddleware> {
    const parsed = CodexpertConnectorConfigSchema.safeParse(options ?? {})
    if (!parsed.success) {
      throw new Error(`Invalid Codexpert connector config: ${parsed.error.message}`)
    }
    const config = parsed.data

    if (!config.codexpertMcpUrl || !config.codexpertConnectorBaseUrl || !config.serviceToken) {
      return {
        name: CODEXPERT_CONNECTOR_MIDDLEWARE_NAME,
      }
    }

    const mcpTools = MCP_TOOL_NAMES.map((toolName) =>
      tool(
        async (args, runnableConfig) => {
          const principal = resolvePrincipal(context, runnableConfig)
          return callCodexpertMcpTool(
            {
              codexpertMcpUrl: config.codexpertMcpUrl!,
              serviceToken: config.serviceToken!,
            },
            principal,
            toolName,
            normalizeRecord(args),
            config.timeoutMs ?? 600_000,
          )
        },
        {
          name: toolName,
          description: buildMcpToolDescription(toolName),
          schema: passthroughToolSchema,
        },
      ),
    )

    const runTool = tool(
      async (input, runnableConfig) => {
        return this.runCodexpertTask(config, context, input, runnableConfig)
      },
      {
        name: 'runCodexpertTask',
        description: RUN_CODEXPERT_TASK_DESCRIPTION,
        schema: RunCodexpertTaskInputSchema,
      },
    )

    return {
      name: CODEXPERT_CONNECTOR_MIDDLEWARE_NAME,
      tools: [...mcpTools, runTool],
    }
  }

  private async runCodexpertTask(
    config: CodexpertConnectorConfig,
    context: IAgentMiddlewareContext,
    input: RunCodexpertTaskInput,
    runnableConfig?: RunnableConfig,
  ): Promise<CodexpertTaskResult> {
    const timeoutMs = input.timeoutMs ?? config.timeoutMs ?? 600_000
    const executionId = pickString((runnableConfig?.configurable as Record<string, unknown> | undefined)?.executionId)
    const toolCall = getToolCallFromConfig(runnableConfig)
    let sessionId = pickString(input.codingSessionId)
    let sessionSnapshot: Record<string, unknown> | null = null
    let finalEvent: CodexpertConnectorEvent | null = null
    let result: CodexpertTaskResult = buildInitialResult(input)
    let principal: PrincipalContext | null = null
    const projectionState = createProjectionState()

    try {
      principal = resolvePrincipal(context, runnableConfig)
      if (!sessionId) {
        sessionSnapshot = await this.resolveOrCreateSession(config, principal, input, timeoutMs)
        sessionId = pickString(sessionSnapshot.codingSessionId, sessionSnapshot.id)
      }
      if (!sessionId) {
        throw new Error('Missing Codexpert codingSessionId. Use selectCodingContext or resumeCodexpertSession before runCodexpertTask.')
      }

      await this.runService.record({
        tenantId: principal.tenantId,
        organizationId: principal.organizationId,
        userId: principal.userId,
        xpertId: pickString(input.xpertId, sessionSnapshot?.xpertId),
        conversationId: pickString(input.conversationId, sessionSnapshot?.sourceConversationId),
        executionId,
        codingSessionId: sessionId,
        status: 'running',
        metadata: { toolCallId: toolCall?.id ?? null },
      })

      for await (const event of streamCodexpertPrompt(
        {
          codexpertConnectorBaseUrl: config.codexpertConnectorBaseUrl!,
          serviceToken: config.serviceToken!,
        },
        principal,
        sessionId,
        {
          prompt: input.prompt,
          title: input.taskTitle,
          requestId: toolCall?.id ?? executionId ?? undefined,
        },
        timeoutMs,
      )) {
        finalEvent = event.type === 'done' || event.type === 'error' ? event : finalEvent
        if (config.enableVisibleProjection ?? true) {
          await projectVisibleCodexpertEvent(
            event,
            projectionState,
            runnableConfig,
            config.enableStatusEvents ?? true,
          )
        }
      }
      flushVisibleCodexpertProjection(projectionState, runnableConfig)

      result = buildResult(input, sessionId, finalEvent, null, sessionSnapshot)
      await this.runService.record({
        tenantId: principal.tenantId,
        organizationId: principal.organizationId,
        userId: principal.userId,
        xpertId: pickString(input.xpertId, sessionSnapshot?.xpertId),
        conversationId: pickString(input.conversationId, sessionSnapshot?.sourceConversationId),
        executionId,
        codingSessionId: result.codingSessionId,
        taskId: result.taskId,
        threadId: result.threadId,
        codexpertExecutionId: result.executionId,
        status: result.status,
        lastError: result.error,
        metadata: { toolCallId: toolCall?.id ?? null },
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      flushVisibleCodexpertProjection(projectionState, runnableConfig)
      projectImmediateError(message, runnableConfig)
      result = buildResult(input, sessionId ?? null, finalEvent, message, sessionSnapshot)
      if (!principal) {
        return result
      }
      await this.runService.record({
        tenantId: principal.tenantId,
        organizationId: principal.organizationId,
        userId: principal.userId,
        xpertId: pickString(input.xpertId, sessionSnapshot?.xpertId),
        conversationId: pickString(input.conversationId, sessionSnapshot?.sourceConversationId),
        executionId,
        codingSessionId: result.codingSessionId,
        taskId: result.taskId,
        threadId: result.threadId,
        codexpertExecutionId: result.executionId,
        status: result.status,
        lastError: message,
        metadata: { toolCallId: toolCall?.id ?? null },
      })
      return result
    }
  }

  private async resolveOrCreateSession(
    config: CodexpertConnectorConfig,
    principal: PrincipalContext,
    input: RunCodexpertTaskInput,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    if (input.taskId || input.conversationId || input.threadId) {
      const resolved = await callCodexpertMcpTool<Record<string, unknown>>(
        {
          codexpertMcpUrl: config.codexpertMcpUrl!,
          serviceToken: config.serviceToken!,
        },
        principal,
        'resumeCodexpertSession',
        {
          taskId: input.taskId,
          conversationId: input.conversationId,
          threadId: input.threadId,
        },
        timeoutMs,
      )
      return resolved
    }

    const xpertId = pickString(input.xpertId, config.defaultXpertId)
    const connectionId = pickString(input.connectionId, config.defaultConnectionId)
    const repoId = pickString(input.repoId, config.defaultRepoId)
    const branchName = pickString(input.branchName, config.defaultBranchName)
    if (!xpertId || !connectionId || !repoId || !branchName) {
      throw new Error('Missing Codexpert context. Select assistant, git connection, repository, and branch before runCodexpertTask.')
    }

    const selected = await callCodexpertMcpTool<Record<string, unknown>>(
      {
        codexpertMcpUrl: config.codexpertMcpUrl!,
        serviceToken: config.serviceToken!,
      },
      principal,
      'selectCodingContext',
      {
        xpertId,
        connectionId,
        repoId,
        branchName,
      },
      timeoutMs,
    )

    return createCodexpertSession(
      {
        codexpertConnectorBaseUrl: config.codexpertConnectorBaseUrl!,
        serviceToken: config.serviceToken!,
      },
      principal,
      {
        ...selected,
        xpertId,
        repoId,
        branchName,
        metadata: {
          repoConnectionId: connectionId,
        },
      },
      timeoutMs,
    )
  }
}

function resolvePrincipal(context: IAgentMiddlewareContext, config?: RunnableConfig): PrincipalContext {
  const configurable = config?.configurable as Record<string, unknown> | undefined
  const currentUser = RequestContext.currentUser?.() as Record<string, unknown> | null | undefined
  const contextRecord = context as unknown as Record<string, unknown>
  const tenantId = pickString(
    RequestContext.currentTenantId?.(),
    currentUser?.tenantId,
    contextRecord.tenantId,
    configurable?.tenantId,
  )
  const organizationId = pickString(
    RequestContext.getOrganizationId?.(),
    currentUser?.organizationId,
    contextRecord.organizationId,
    configurable?.organizationId,
  )
  const userId = pickString(
    RequestContext.currentUserId?.(),
    currentUser?.id,
    contextRecord.userId,
    configurable?.userId,
  )
  if (!tenantId || !organizationId || !userId) {
    throw new Error('Codexpert connector requires tenantId, organizationId, and userId. Bind the external user to a real business user before running Codexpert.')
  }
  return { tenantId, organizationId, userId }
}

function buildInitialResult(input: RunCodexpertTaskInput): CodexpertTaskResult {
  return {
    status: 'failed',
    codingSessionId: pickString(input.codingSessionId),
    taskId: pickString(input.taskId),
    threadId: pickString(input.threadId),
    executionId: null,
    repo: input.repoId ? { id: input.repoId } : null,
    branch: pickString(input.branchName),
    environmentId: null,
    environmentReused: null,
    summary: null,
    error: null,
  }
}

function buildResult(
  input: RunCodexpertTaskInput,
  sessionId: string | null,
  event: CodexpertConnectorEvent | null,
  error: string | null,
  sessionSnapshot: Record<string, unknown> | null,
): CodexpertTaskResult {
  const terminal = resolveTerminalResult(event, error)
  const repo = buildRepoResult(input, sessionSnapshot)
  return {
    status: terminal.status,
    codingSessionId: pickString(
      event && 'codingSessionId' in event ? event.codingSessionId : null,
      sessionId,
      sessionSnapshot?.codingSessionId,
      sessionSnapshot?.id,
    ),
    taskId: pickString(event && 'taskId' in event ? event.taskId : null, input.taskId),
    threadId: pickString(event && 'threadId' in event ? event.threadId : null, input.threadId),
    executionId: pickString(event && 'executionId' in event ? event.executionId : null),
    repo,
    branch: pickString(input.branchName, sessionSnapshot?.branchName),
    environmentId: pickString(event && 'environmentId' in event ? event.environmentId : null, sessionSnapshot?.environmentId),
    environmentReused: null,
    summary: event?.type === 'done' ? pickString(event.summary, event.output) : null,
    error: terminal.error,
    ...(event?.type === 'done' && event.prUrl ? { prUrl: event.prUrl } : {}),
  }
}

function resolveTerminalResult(
  event: CodexpertConnectorEvent | null,
  error: string | null,
): Pick<CodexpertTaskResult, 'status' | 'error'> {
  if (error) {
    return { status: isTimeoutError(error) ? 'timeout' : 'failed', error }
  }
  if (!event) {
    return { status: 'failed', error: 'Codexpert stream ended without a terminal event.' }
  }
  if (event.type === 'error') {
    return { status: 'failed', error: event.message }
  }
  if (event.type !== 'done') {
    return { status: 'failed', error: 'Codexpert stream ended without a terminal done event.' }
  }

  const status = normalizeTerminalStatus(event.status)
  if (status === 'success') {
    return { status, error: null }
  }
  return {
    status,
    error: event.status ? `Codexpert finished with status: ${event.status}` : 'Codexpert finished unsuccessfully.',
  }
}

function normalizeTerminalStatus(status: unknown): CodexpertTaskResult['status'] {
  const value = typeof status === 'string' ? status.trim().toLowerCase() : ''
  if (!value || ['success', 'succeeded', 'completed', 'complete', 'done', 'ok'].includes(value)) {
    return 'success'
  }
  if (['timeout', 'timed_out', 'timed-out'].includes(value)) {
    return 'timeout'
  }
  if (['canceled', 'cancelled', 'interrupted', 'aborted'].includes(value)) {
    return 'canceled'
  }
  return 'failed'
}

function isTimeoutError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')
}

function buildRepoResult(
  input: RunCodexpertTaskInput,
  sessionSnapshot: Record<string, unknown> | null,
): CodexpertTaskResult['repo'] {
  const repo = {
    id: pickString(input.repoId, sessionSnapshot?.repoId),
    name: pickString(sessionSnapshot?.repoName),
    owner: pickString(sessionSnapshot?.repoOwner),
    slug: pickString(sessionSnapshot?.repoSlug),
  }
  return repo.id || repo.name || repo.owner || repo.slug ? repo : null
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function projectImmediateError(message: string, config?: RunnableConfig) {
  const subscriber = (config?.configurable as Record<string, any> | undefined)?.subscriber
  if (!subscriber || typeof subscriber.next !== 'function') {
    return
  }
  try {
    subscriber.next({
      data: {
        type: ChatMessageTypeEnum.MESSAGE,
        data: {
          type: 'text',
          text: `Codexpert failed: ${message}`,
          xpertName: CODEXPERT_XPERT_NAME,
          agentKey: CODEXPERT_AGENT_KEY,
        } satisfies TMessageContentText,
      },
    })
  } catch {
    // Ignore callback pipeline errors so the tool can still return the failure metadata.
  }
}
