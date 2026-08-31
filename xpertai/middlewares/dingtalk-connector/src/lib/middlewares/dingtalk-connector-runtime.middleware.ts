import { SystemMessage } from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddlewareStrategy,
  BaseSandbox,
  ConnectorRuntimeCapability,
  type AgentBuiltInState,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type ConnectorRuntimeCredential,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type Runtime,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { DINGTALK_CONNECTOR_ICON } from '../branding.js'
import { DINGTALK_CONNECTOR_PROVIDER } from '../dingtalk-connector.strategy.js'
import {
  DINGTALK_CLI_VERSION,
  DingTalkCliBootstrapService,
  type DingTalkCliRuntimePaths,
  readCredentialValue
} from './dingtalk-cli-bootstrap.service.js'

export const DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${DINGTALK_CONNECTOR_PROVIDER}`

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

type DingTalkConnectorRuntimeConfig = {
  connectorId?: string
}

@Injectable()
@AgentMiddlewareStrategy(DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class DingTalkConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<DingTalkConnectorRuntimeConfig> {
  readonly meta: TAgentMiddlewareMeta & { builtin: true } = {
    name: DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'DingTalk connector runtime',
      zh_Hans: '钉钉连接器运行时'
    },
    description: {
      en_US: 'Hidden CLI runtime implementation used by the DingTalk workspace connector.',
      zh_Hans: '供钉钉工作区连接器使用的隐藏命令行运行时实现。'
    },
    icon: DINGTALK_CONNECTOR_ICON,
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly bootstrap: DingTalkCliBootstrapService) {}

  createMiddleware(options: DingTalkConnectorRuntimeConfig = {}, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined
    const workspaceId = context.workspaceId
    const connectorId = normalizeString(options.connectorId)

    const authEnsureTool = tool(
      async (_input: Record<string, never>, runConfig?: RunnableConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        const paths = getRuntimePathsFromConfig(this.bootstrap, runConfig)
        return JSON.stringify(
          await buildAuthEnsureResponse({
            backend,
            bootstrap: this.bootstrap,
            connectorRuntime,
            workspaceId,
            connectorId,
            paths
          })
        )
      },
      {
        name: 'dingtalk-cli-auth-ensure',
        description:
          'Check whether DingTalk Workspace CLI and the active DWS-managed DingTalk connector are ready. ' +
          'This tool never starts a second DingTalk login and never returns access tokens or application secrets.',
        schema: z.object({}).strict(),
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Check DingTalk authentication', zh_Hans: '检查钉钉认证' }
        }
      }
    )

    const waitUserTool = tool(
      async (_input: Record<string, never>, runConfig?: RunnableConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        const paths = getRuntimePathsFromConfig(this.bootstrap, runConfig)
        const status = await buildAuthEnsureResponse({
          backend,
          bootstrap: this.bootstrap,
          connectorRuntime,
          workspaceId,
          connectorId,
          paths
        })
        return JSON.stringify({
          success: status.isLoggedIn && status.tokenValid,
          identityType: status.identityType,
          waitedSeconds: 0,
          message: status.isLoggedIn
            ? 'Workspace connector authentication is ready; DingTalk CLI does not require a second login.'
            : status.message
        })
      },
      {
        name: 'dingtalk-cli-wait-user',
        description:
          'Recheck the DWS-managed DingTalk connector after the user completes authorization in the connector page. ' +
          'This tool does not start a device login.',
        schema: z.object({}).strict(),
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Wait for DingTalk authentication', zh_Hans: '等待钉钉认证' }
        }
      }
    )

    return {
      name: DINGTALK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [authEnsureTool, waitUserTool],
      wrapModelCall: async (request, handler) => {
        const paths = getRuntimePaths(this.bootstrap, request.runtime)
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, this.bootstrap.buildSystemPrompt(paths)].filter(Boolean).join('\n\n')
        return handler({
          ...request,
          systemMessage: new SystemMessage({ content })
        })
      },
      wrapToolCall: async (request: ToolCallRequest<AgentBuiltInState>, handler) => {
        if (!isSandboxShellTool(request.tool)) return handler(request)

        const command = getSandboxShellCommand(request)
        if (!this.bootstrap.isDwsCommand(command)) return handler(request)
        this.bootstrap.validateAgentCommand(command)

        const backend = getSandboxBackend(request.runtime)
        if (!backend) throw new Error('DingTalk CLI connector runtime requires SandboxShell')
        const paths = getRuntimePaths(this.bootstrap, request.runtime)
        const credential = await prepareCliRuntime({
          backend,
          bootstrap: this.bootstrap,
          connectorRuntime,
          workspaceId,
          connectorId,
          paths
        })
        const credentialPaths = await this.bootstrap.syncConnectorCredential(backend, credential, paths)
        const wrapped = withCommand(request, this.bootstrap.buildConnectorCommand(command, credential, credentialPaths))

        const operation = await capture(() => Promise.resolve(handler(wrapped)))
        const cleanup = await capture(() => this.bootstrap.removeCredential(backend, credentialPaths.envPath))
        if (!operation.ok) {
          if (!cleanup.ok) {
            throw new AggregateError(
              [operation.error, cleanup.error],
              'DingTalk CLI command failed and its credential file could not be removed'
            )
          }
          throw operation.error
        }
        if (!cleanup.ok) throw cleanup.error
        return operation.value
      }
    }
  }
}

async function buildAuthEnsureResponse(input: {
  backend: BaseSandbox | null
  bootstrap: DingTalkCliBootstrapService
  connectorRuntime?: ConnectorRuntimeApi
  workspaceId?: string
  connectorId?: string
  paths: DingTalkCliRuntimePaths
}) {
  const base = {
    configExists: true,
    authMode: 'connector',
    identityType: 'none' as 'none' | 'user',
    isLoggedIn: false,
    tokenValid: false,
    tokenExpiresAt: null as string | null,
    authorizationUrl: null,
    deviceCode: null,
    cliVersion: DINGTALK_CLI_VERSION
  }
  if (!input.backend) {
    return { ...base, configValid: false, cliReady: false, message: 'Sandbox backend is not available.' }
  }

  try {
    const credential = await prepareCliRuntime(input)
    return {
      ...base,
      configValid: true,
      cliReady: true,
      identityType: 'user' as const,
      isLoggedIn: true,
      tokenValid: true,
      tokenExpiresAt: credential.expiresAt ?? null,
      connectorId: credential.connectorId,
      profile: allowlistedProfile(credential),
      scopes: credential.scopes ?? [],
      message: 'DWS-managed connector authentication and DingTalk CLI are ready.'
    }
  } catch (error) {
    return {
      ...base,
      configValid: false,
      cliReady: false,
      message: `DingTalk connector auth check failed: ${errorMessage(error)}`
    }
  }
}

async function prepareCliRuntime(input: {
  backend: BaseSandbox
  bootstrap: DingTalkCliBootstrapService
  connectorRuntime?: ConnectorRuntimeApi
  workspaceId?: string
  connectorId?: string
  paths: DingTalkCliRuntimePaths
}) {
  await input.bootstrap.ensureBootstrap(input.backend, input.paths)
  return resolveConnectorCredential(input.connectorRuntime, input.workspaceId, input.connectorId)
}

async function resolveConnectorCredential(
  connectorRuntime?: ConnectorRuntimeApi,
  workspaceId?: string,
  connectorId?: string
): Promise<ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2> {
  if (!workspaceId) throw new Error('DingTalk connector runtime requires workspaceId')
  if (!connectorRuntime?.getConnector && !connectorRuntime?.getConnectorCredential) {
    throw new Error('DingTalk connector runtime requires platform.connector support')
  }
  const input = {
    workspaceId,
    provider: DINGTALK_CONNECTOR_PROVIDER,
    ...(connectorId ? { connectorId } : {})
  }
  if (connectorRuntime.getConnectorCredential) return connectorRuntime.getConnectorCredential(input)
  return connectorRuntime.getConnector(input)
}

function allowlistedProfile(credential: ConnectorRuntimeCredential | ConnectorRuntimeCredentialV2) {
  const profile = credential.profile
  return {
    name: profile?.name ?? undefined,
    avatarUrl: profile?.avatarUrl ?? undefined,
    userId: profile?.userId ?? undefined,
    openId: profile?.openId ?? undefined,
    unionId: profile?.unionId ?? undefined,
    corpId: profile?.corpId ?? readCredentialValue(credential, 'corpId') ?? undefined
  }
}

function getSandboxBackend(runtime: Runtime | undefined) {
  const backend = runtime?.configurable?.sandbox?.backend
  return backend && typeof (backend as BaseSandbox).execute === 'function' ? (backend as BaseSandbox) : null
}

function getSandboxBackendFromConfig(runConfig?: RunnableConfig) {
  const backend = (runConfig?.configurable as TAgentRunnableConfigurable | undefined)?.sandbox?.backend
  return backend && typeof (backend as BaseSandbox).execute === 'function' ? (backend as BaseSandbox) : null
}

function getRuntimePaths(bootstrap: DingTalkCliBootstrapService, runtime: Runtime | undefined) {
  return bootstrap.resolveRuntimePaths(getSandboxPathContext(runtime?.configurable))
}

function getRuntimePathsFromConfig(bootstrap: DingTalkCliBootstrapService, runConfig?: RunnableConfig) {
  return bootstrap.resolveRuntimePaths(getSandboxPathContext(runConfig?.configurable))
}

function getSandboxPathContext(configurable: unknown) {
  if (!isRecord(configurable)) return undefined
  const sandbox = configurable['sandbox']
  if (!isRecord(sandbox)) return undefined
  const backend = sandbox['backend']
  return {
    workspaceRoot: normalizeString(sandbox['workspaceRoot']),
    workingDirectory:
      normalizeString(sandbox['workingDirectory']) ??
      (isRecord(backend) ? normalizeString(backend['workingDirectory']) : undefined)
  }
}

function isSandboxShellTool(value: { name?: string } | Record<string, unknown>) {
  return value?.name === SANDBOX_SHELL_TOOL_NAME
}

function getSandboxShellCommand(request: ToolCallRequest<AgentBuiltInState>) {
  const args = request.toolCall?.args
  if (!isRecord(args)) return ''
  return normalizeString(args['command']) ?? ''
}

function withCommand(request: ToolCallRequest<AgentBuiltInState>, command: string) {
  return {
    ...request,
    toolCall: {
      ...request.toolCall,
      args: { ...(isRecord(request.toolCall?.args) ? request.toolCall.args : {}), command }
    }
  }
}

async function capture<T>(operation: () => Promise<T>) {
  try {
    return { ok: true as const, value: await operation() }
  } catch (error) {
    return { ok: false as const, error }
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
