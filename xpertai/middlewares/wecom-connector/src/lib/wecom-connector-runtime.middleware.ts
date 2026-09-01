import { RunnableConfig } from '@langchain/core/runnables'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  type AgentBuiltInState,
  BaseSandbox,
  ConnectorRuntimeCapability,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type Runtime,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { WeComCliBootstrapService, type WeComCliRuntimePaths } from './wecom-cli-bootstrap.service.js'
import {
  containsWeComCliReference,
  isDirectSkillReadCommand,
  parseWeComCliCommand
} from './wecom-cli-command-policy.js'
import { WECOM_CLI_QR_AUTH_METHOD, WECOM_CONNECTOR_PROVIDER, WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

type RuntimeConfig = { provider?: string; connectorId?: string }

@Injectable()
@AgentMiddlewareStrategy(WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class WeComConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<RuntimeConfig> {
  readonly meta: TAgentMiddlewareMeta & { builtin: true } = {
    name: WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'WeCom connector runtime', zh_Hans: '企业微信连接器运行时' },
    description: {
      en_US: 'Managed WeCom CLI runtime for the active workspace connector.',
      zh_Hans: '为当前工作区企业微信连接器提供受管控的 CLI 运行时。'
    },
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly bootstrap: WeComCliBootstrapService) {}

  createMiddleware(options: RuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorId = readString(options?.connectorId)
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability) as
      | ConnectorRuntimeApi
      | undefined
    const workspaceId = context.workspaceId
    const config = this.bootstrap.resolveConfig()

    const authEnsureTool = tool(
      async (_input: Record<string, never>, runConfig?: RunnableConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        if (!backend) throw new Error('WeCom CLI authentication requires SandboxShell.')
        const credential = await resolveConnectorCredential(connectorRuntime, workspaceId, connectorId)
        const paths = getRuntimePaths(this.bootstrap, runConfig)
        return JSON.stringify(await this.bootstrap.ensureAuthorized(backend, credential, paths, config))
      },
      {
        name: 'wecom_cli_auth_ensure',
        description:
          'Ensure the active WeCom workspace connector is authorized for the official WeCom CLI. This is the only authentication tool; it never accepts or returns Bot ID, Secret, tokens, or internal connector IDs.',
        schema: z.object({}).strict(),
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'WeCom CLI authentication', zh_Hans: '企业微信 CLI 认证' } }
      }
    )

    return {
      name: WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
      tools: [authEnsureTool],
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) return handler(request)
        const paths = getRuntimePaths(this.bootstrap, request.runtime)
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        return handler({
          ...request,
          systemMessage: new SystemMessage({
            content: [baseContent, this.bootstrap.buildSystemPrompt(paths)].filter(Boolean).join('\n\n')
          })
        })
      },
      wrapToolCall: async (request: ToolCallRequest<AgentBuiltInState>, handler) => {
        if (!isSandboxShellTool(request.tool)) return handler(request)
        const command = getSandboxShellCommand(request)
        const paths = getRuntimePaths(this.bootstrap, request.runtime)
        const hasWeComCliReference = containsWeComCliReference(command, paths.binaryPath)
        if (!hasWeComCliReference && isDirectSkillReadCommand(command, paths.skillsDir)) {
          const backend = getSandboxBackend(request.runtime)
          if (backend) await this.bootstrap.ensureBootstrap(backend, config, paths)
          return handler(request)
        }
        if (!hasWeComCliReference) return handler(request)
        const parsed = parseWeComCliCommand(command, paths.binaryPath)
        const backend = getSandboxBackend(request.runtime)
        if (!backend) throw new Error('WeCom CLI connector mode requires SandboxShell.')
        const credential = await resolveConnectorCredential(connectorRuntime, workspaceId, connectorId)
        await this.bootstrap.ensureAuthorized(backend, credential, paths, config)
        return handler({
          ...request,
          toolCall: {
            ...request.toolCall,
            args: {
              ...((request.toolCall?.args as Record<string, unknown>) ?? {}),
              command: this.bootstrap.buildManagedCommand(parsed.commandTail, credential.connectorId, paths, config)
            }
          }
        })
      }
    }
  }
}

async function resolveConnectorCredential(
  connectorRuntime: ConnectorRuntimeApi | undefined,
  workspaceId: string | undefined,
  connectorId: string | undefined
) {
  if (!workspaceId) throw new Error('WeCom connector runtime requires workspaceId.')
  if (!connectorRuntime?.getConnectorCredential) {
    throw new Error('WeCom connector runtime requires Xpert plugin SDK connector credential capability.')
  }
  const credential = await connectorRuntime.getConnectorCredential({
    workspaceId,
    provider: WECOM_CONNECTOR_PROVIDER,
    ...(connectorId ? { connectorId } : {})
  })
  if (credential.authMethodId !== WECOM_CLI_QR_AUTH_METHOD) {
    throw new Error(
      'This WeCom connector uses the retired application OAuth flow. Reconnect it with WeCom AI Bot authentication.'
    )
  }
  return credential
}

function getSandboxBackend(runtime: Runtime | undefined) {
  const backend = runtime?.configurable?.sandbox?.backend
  return backend && typeof (backend as BaseSandbox).execute === 'function' ? (backend as BaseSandbox) : null
}

function getSandboxBackendFromConfig(runConfig?: RunnableConfig) {
  const configurable = runConfig?.configurable as Record<string, unknown> | undefined
  const sandbox = configurable?.['sandbox']
  const backend = isRecord(sandbox) ? sandbox['backend'] : undefined
  return backend && typeof (backend as BaseSandbox).execute === 'function' ? (backend as BaseSandbox) : null
}

function getRuntimePaths(bootstrap: WeComCliBootstrapService, runtime: Runtime | undefined): WeComCliRuntimePaths
function getRuntimePaths(bootstrap: WeComCliBootstrapService, runConfig?: RunnableConfig): WeComCliRuntimePaths
function getRuntimePaths(bootstrap: WeComCliBootstrapService, value?: Runtime | RunnableConfig): WeComCliRuntimePaths {
  const configurable =
    (value as Runtime | undefined)?.configurable ?? (value as RunnableConfig | undefined)?.configurable
  const sandbox = isRecord(configurable?.['sandbox']) ? configurable['sandbox'] : {}
  const workspaceRoot = readString(sandbox['workspaceRoot']) ?? readString(sandbox['workingDirectory'])
  const backend = isRecord(sandbox['backend']) ? sandbox['backend'] : {}
  return bootstrap.resolveRuntimePaths({ workspaceRoot, workingDirectory: readString(backend['workingDirectory']) })
}

function isSandboxShellTool(toolValue: { name?: string } | Record<string, unknown>) {
  return toolValue?.name === SANDBOX_SHELL_TOOL_NAME
}

function getSandboxShellCommand(request: ToolCallRequest<AgentBuiltInState>) {
  const args = request.toolCall?.args
  const command = args && typeof args === 'object' ? Reflect.get(args, 'command') : undefined
  return typeof command === 'string' ? command : ''
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
