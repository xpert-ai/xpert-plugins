import { RunnableConfig } from '@langchain/core/runnables'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  AgentBuiltInState,
  BaseSandbox,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type ConnectorRuntimeApi,
  type ConnectorRuntimeCredential,
  Runtime,
  ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { LarkBootstrapService, type LarkCliRuntimePaths } from './lark-bootstrap.service.js'
import {
  LARK_CLI_SKILL_MIDDLEWARE_NAME,
  LarkAuthMode,
  LarkCliConfig,
  LarkCliMiddlewareConfigFormSchema
} from './lark-cli.types.js'
import type { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { LarkIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(LARK_CLI_SKILL_MIDDLEWARE_NAME)
export class LarkCLISkillMiddleware implements IAgentMiddlewareStrategy<Partial<LarkCliConfig>> {
  constructor(private readonly larkBootstrapService: LarkBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: LARK_CLI_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Lark CLI Skill',
      zh_Hans: 'Lark CLI 技能'
    },
    description: {
      en_US: 'Bootstraps the Lark CLI tool into the sandbox, downloads AI Agent Skills from GitHub, and teaches the agent how to interact with Lark/Feishu through sandbox_shell.',
      zh_Hans: '将 Lark CLI 工具写入 sandbox，从 GitHub 下载 AI Agent Skills，并指导智能体通过 sandbox_shell 与飞书交互。'
    },
    icon: {
      type: 'image',
      value: LarkIcon
    },
    configSchema: LarkCliMiddlewareConfigFormSchema
  }

  createMiddleware(options: Partial<LarkCliConfig>, context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.larkBootstrapService.resolveConfig(options)

    const bootstrapService = this.larkBootstrapService
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined
    const workspaceId = context.workspaceId

    // Tool: lark-cli-auth-ensure
    const authEnsureTool = tool(
      async (_input: Record<string, never>, runConfig?: RunnableConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        const paths = getLarkCliRuntimePathsFromConfig(bootstrapService, runConfig)
        if (config.authMode === LarkAuthMode.CONNECTOR) {
          const response = await buildConnectorAuthEnsureResponse({
            backend,
            bootstrapService,
            config,
            connectorRuntime,
            workspaceId,
            paths
          })
          return JSON.stringify(response)
        }
        const response = await bootstrapService.buildAuthEnsureResponse(backend, config, paths)
        return JSON.stringify(response)
      },
      {
        name: 'lark-cli-auth-ensure',
        description: 
          'Check the current Lark CLI authentication status and configuration. ' +
          'Returns information about whether the configuration exists and is valid, ' +
          'current identity type (bot/user), token validity, and authorization URL if user login is required. ' +
          'For bot mode, this tool ensures credentials are synced and attempts automatic login. ' +
          'For connector mode, this tool checks the active workspace connector and never starts device login. ' +
          'For user mode, this tool returns an authorization URL if login is needed.',
        schema: z.object({})
      }
    )

    // Tool: lark-cli-wait-user
    const waitUserTool = tool(
      async ({ deviceCode, maxWaitSeconds }: { deviceCode: string; maxWaitSeconds: number }, runConfig?: RunnableConfig) => {
        if (config.authMode === LarkAuthMode.CONNECTOR) {
          return JSON.stringify({
            success: true,
            identityType: 'user',
            waitedSeconds: 0,
            message: 'Connector mode uses the workspace OAuth connector; device login is not required.'
          })
        }

        const backend = getSandboxBackendFromConfig(runConfig)
        if (!backend) {
          return JSON.stringify({
            success: false,
            identityType: 'none',
            waitedSeconds: 0,
            message: 'Sandbox backend not available.'
          })
        }
        const response = await bootstrapService.waitForUserLogin(backend, deviceCode, maxWaitSeconds)
        return JSON.stringify(response)
      },
      {
        name: 'lark-cli-wait-user',
        description: 
          'Wait for user to complete OAuth login by scanning QR code or visiting authorization URL. ' +
          'This tool polls the authentication status for up to 60 seconds (configurable). ' +
          'Use this after lark-cli-auth-ensure returns an authorizationUrl and deviceCode. ' +
          'Returns success=true when user completes login, or success=false on timeout.',
        schema: z.object({
          deviceCode: z.string().describe('Device code from lark-cli-auth-ensure response'),
          maxWaitSeconds: z.number().min(10).max(120).default(60).describe('Maximum seconds to wait for user login (default 60)')
        })
      }
    )

    return {
      name: LARK_CLI_SKILL_MIDDLEWARE_NAME,
      tools: [authEnsureTool, waitUserTool],
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.larkBootstrapService.buildSystemPrompt(
          getLarkCliRuntimePaths(this.larkBootstrapService, request.runtime)
        )
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, prompt].filter(Boolean).join('\n\n')

        return handler({
          ...request,
          systemMessage: new SystemMessage({
            content
          })
        })
      },
      wrapToolCall: async (request: ToolCallRequest<AgentBuiltInState>, handler) => {
        if (!isSandboxShellTool(request.tool)) {
          return handler(request)
        }

        const command = getSandboxShellCommand(request)
        if (!this.larkBootstrapService.isLarkCliCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (config.authMode === LarkAuthMode.CONNECTOR && !backend) {
          throw new Error('Lark CLI connector mode requires SandboxShell.')
        }

        const paths = getLarkCliRuntimePaths(this.larkBootstrapService, request.runtime)
        let credential: ConnectorRuntimeCredential | null = null
        if (backend) {
          credential = await prepareLarkCliRuntime(
            backend,
            config,
            this.larkBootstrapService,
            connectorRuntime,
            workspaceId,
            paths
          )
        }

        if (config.authMode === LarkAuthMode.CONNECTOR) {
          if (!credential) {
            throw new Error('Lark CLI connector mode requires an active connector credential.')
          }
          return handler(withConnectorCommand(request, this.larkBootstrapService.buildConnectorCommand(command, credential.connectorId, paths)))
        }

        return handler(request)
      }
    }
  }
}

function getSandboxBackend(runtime: Runtime | undefined) {
  const backend = runtime?.configurable?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).execute === 'function') {
    return backend as BaseSandbox
  }
  return null
}

function getSandboxBackendFromConfig(runConfig?: RunnableConfig) {
  const backend = (runConfig?.configurable as TAgentRunnableConfigurable)?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).execute === 'function') {
    return backend as BaseSandbox
  }
  return null
}

function getLarkCliRuntimePaths(
  bootstrapService: LarkBootstrapService,
  runtime: Runtime | undefined
) {
  return bootstrapService.resolveRuntimePaths(getSandboxPathContext(runtime?.configurable as TAgentRunnableConfigurable | Record<string, unknown> | undefined))
}

function getLarkCliRuntimePathsFromConfig(
  bootstrapService: LarkBootstrapService,
  runConfig?: RunnableConfig
) {
  return bootstrapService.resolveRuntimePaths(getSandboxPathContext(runConfig?.configurable as TAgentRunnableConfigurable | Record<string, unknown> | undefined))
}

function getSandboxPathContext(configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined) {
  const sandbox = configurable?.['sandbox']
  if (!sandbox || typeof sandbox !== 'object' || Array.isArray(sandbox)) {
    return undefined
  }

  const sandboxRecord = sandbox as Record<string, unknown>
  const workspaceRoot = readString(sandboxRecord['workspaceRoot']) ?? readWorkspaceBindingRoot(sandboxRecord['workspaceBinding'])
  const backend = sandboxRecord['backend']
  const backendWorkingDirectory =
    backend && typeof backend === 'object' && !Array.isArray(backend)
      ? readString((backend as Record<string, unknown>)['workingDirectory'])
      : undefined

  return {
    workspaceRoot,
    workingDirectory: readString(sandboxRecord['workingDirectory']) ?? backendWorkingDirectory
  }
}

function readWorkspaceBindingRoot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return readString((value as Record<string, unknown>)['workspaceRoot'])
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isSandboxShellTool(tool: { name?: string } | Record<string, any>) {
  return tool?.name === SANDBOX_SHELL_TOOL_NAME
}

function getSandboxShellCommand(request: ToolCallRequest<AgentBuiltInState>) {
  const args = request.toolCall?.args
  if (!args || typeof args !== 'object') {
    return ''
  }
  const command = (args as Record<string, unknown>)['command']
  return typeof command === 'string' ? command : ''
}

async function prepareLarkCliRuntime(
  backend: BaseSandbox,
  config: LarkCliConfig,
  bootstrapService: LarkBootstrapService,
  connectorRuntime?: ConnectorRuntimeApi,
  workspaceId?: string,
  paths?: LarkCliRuntimePaths
) {
  await bootstrapService.ensureBootstrap(backend, config, paths)

  if (config.authMode === LarkAuthMode.BOT) {
    await bootstrapService.syncBotCredentials(backend, config, paths)
    return null
  }

  if (config.authMode === LarkAuthMode.CONNECTOR) {
    const credential = await resolveConnectorCredential(config, connectorRuntime, workspaceId)
    if (!credential) {
      throw new Error('Lark CLI connector mode requires an active connector credential.')
    }
    await bootstrapService.syncConnectorCredential(backend, credential, paths)
    return credential
  }

  return null
}

async function resolveConnectorCredential(
  config: LarkCliConfig,
  connectorRuntime?: ConnectorRuntimeApi,
  workspaceId?: string
) {
  if (config.authMode !== LarkAuthMode.CONNECTOR) {
    return null
  }

  if (!workspaceId) {
    throw new Error('Lark CLI connector mode requires workspaceId in middleware runtime context.')
  }

  if (!connectorRuntime) {
    throw new Error('Lark CLI connector mode requires platform.connector runtime capability.')
  }

  return connectorRuntime.getConnector({
    workspaceId,
    provider: 'lark',
    ...(config.connectorId ? { connectorId: config.connectorId } : {})
  })
}

async function buildConnectorAuthEnsureResponse(input: {
  backend: BaseSandbox | null
  bootstrapService: LarkBootstrapService
  config: LarkCliConfig
  connectorRuntime?: ConnectorRuntimeApi
  workspaceId?: string
  paths?: LarkCliRuntimePaths
}) {
  const base = {
    configExists: true,
    authMode: LarkAuthMode.CONNECTOR,
    identityType: 'none' as const,
    isLoggedIn: false,
    tokenValid: false,
    tokenExpiresAt: null,
    authorizationUrl: null,
    deviceCode: null
  }

  if (!input.backend) {
    return {
      ...base,
      configValid: false,
      message: 'Sandbox backend not available. Connector mode requires SandboxShell.'
    }
  }

  try {
    const credential = await prepareLarkCliRuntime(
      input.backend,
      input.config,
      input.bootstrapService,
      input.connectorRuntime,
      input.workspaceId,
      input.paths
    )
    return {
      ...base,
      configValid: true,
      identityType: 'user' as const,
      isLoggedIn: true,
      tokenValid: true,
      tokenExpiresAt: credential?.expiresAt ?? null,
      message: 'Workspace connector authentication is ready.'
    }
  } catch (error) {
    return {
      ...base,
      configValid: false,
      message: `Connector auth check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

function withConnectorCommand(
  request: ToolCallRequest<AgentBuiltInState>,
  command: string
): ToolCallRequest<AgentBuiltInState> {
  return {
    ...request,
    toolCall: {
      ...request.toolCall,
      args: {
        ...((request.toolCall?.args as Record<string, unknown>) ?? {}),
        command
      }
    }
  }
}
