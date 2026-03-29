import { RunnableConfig } from '@langchain/core/runnables'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  AgentBuiltInState,
  BaseSandbox,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  Runtime,
  ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { LarkBootstrapService } from './lark-bootstrap.service.js'
import {
  LARK_CLI_SKILL_MIDDLEWARE_NAME,
  LarkAuthMode,
  LarkCliConfig,
  LarkCliMiddlewareConfigFormSchema
} from './lark-cli.types.js'
import type { TAgentRunnableConfigurable } from '@metad/contracts'
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

  createMiddleware(options: Partial<LarkCliConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.larkBootstrapService.resolveConfig(options)

    const bootstrapService = this.larkBootstrapService

    // Tool: lark-cli-auth-ensure
    const authEnsureTool = tool(
      async (_input: Record<string, never>, runConfig?: RunnableConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        const response = await bootstrapService.buildAuthEnsureResponse(backend, config)
        return JSON.stringify(response)
      },
      {
        name: 'lark-cli-auth-ensure',
        description: 
          'Check the current Lark CLI authentication status and configuration. ' +
          'Returns information about whether the configuration exists and is valid, ' +
          'current identity type (bot/user), token validity, and authorization URL if user login is required. ' +
          'For bot mode, this tool ensures credentials are synced and attempts automatic login. ' +
          'For user mode, this tool returns an authorization URL if login is needed.',
        schema: z.object({})
      }
    )

    // Tool: lark-cli-wait-user
    const waitUserTool = tool(
      async ({ deviceCode, maxWaitSeconds }: { deviceCode: string; maxWaitSeconds: number }, runConfig?: RunnableConfig) => {
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
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        if (backend) {
          await this.larkBootstrapService.ensureBootstrap(backend, config)
          if (config.authMode === LarkAuthMode.BOT) {
            await this.larkBootstrapService.syncBotCredentials(backend, config)
          }
        }
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.larkBootstrapService.buildSystemPrompt()
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
        if (backend) {
          await this.larkBootstrapService.ensureBootstrap(backend, config)
          if (config.authMode === LarkAuthMode.BOT) {
            await this.larkBootstrapService.syncBotCredentials(backend, config)
          }
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
