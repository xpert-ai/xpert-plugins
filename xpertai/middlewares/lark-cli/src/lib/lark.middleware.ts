import { SystemMessage } from '@langchain/core/messages'
import { ToolMessage } from '@langchain/core/messages/tool'
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
  LarkAuthEnsureResponseSchema,
  LarkAuthMode,
  LarkCliConfig,
  LarkCliConfigFormSchema,
  LarkWaitUserResponseSchema
} from './lark-cli.types.js'
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
      type: 'svg',
      value: LarkIcon
    },
    configSchema: LarkCliConfigFormSchema
  }

  createMiddleware(options: Partial<LarkCliConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.larkBootstrapService.resolveConfig(options)

    // Tool: lark-cli-auth-ensure
    const authEnsureTool = tool(
      async () => {
        // Get sandbox backend from the current execution context
        // Note: We need to access the backend through the runtime context
        // For now, we'll return a response that indicates the tool needs to be called
        // with the sandbox backend available through wrapToolCall
        
        return JSON.stringify({
          configExists: true,
          configValid: config.authMode === LarkAuthMode.USER || 
            (config.authMode === LarkAuthMode.BOT && !!config.appId && !!config.appSecret),
          authMode: config.authMode,
          identityType: 'none',
          isLoggedIn: false,
          tokenValid: false,
          tokenExpiresAt: null,
          authorizationUrl: null,
          deviceCode: null,
          message: 'Use sandbox_shell to run "lark-cli auth status" to check authentication. ' +
            'For user mode, run "lark-cli auth login --recommend --no-wait" to get authorization URL. ' +
            'For bot mode, credentials are synced automatically.'
        })
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
      async ({ deviceCode, maxWaitSeconds }) => {
        return JSON.stringify({
          success: false,
          identityType: 'none',
          waitedSeconds: 0,
          message: `Use sandbox_shell to poll for user login completion. ` +
            `Run: lark-cli auth login --device-code "${deviceCode}" --format json ` +
            `Repeat every 3 seconds for up to ${maxWaitSeconds} seconds until login succeeds or times out.`
        })
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
          await this.larkBootstrapService.ensureBootstrap(backend)
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
        // Handle lark-cli-auth-ensure tool specially
        if (request.tool?.name === 'lark-cli-auth-ensure') {
          const backend = getSandboxBackend(request.runtime)
          if (backend) {
            const response = await this.larkBootstrapService.buildAuthEnsureResponse(backend, config)
            return new ToolMessage({
              content: JSON.stringify(response),
              tool_call_id: request.toolCall?.id ?? ''
            })
          }
          // Fallback if backend not available
          return new ToolMessage({
            content: JSON.stringify({
              configExists: true,
              configValid: config.authMode === LarkAuthMode.USER || 
                (config.authMode === LarkAuthMode.BOT && !!config.appId && !!config.appSecret),
              authMode: config.authMode,
              identityType: 'none',
              isLoggedIn: false,
              tokenValid: false,
              tokenExpiresAt: null,
              authorizationUrl: null,
              deviceCode: null,
              message: 'Sandbox backend not available.'
            }),
            tool_call_id: request.toolCall?.id ?? ''
          })
        }

        // Handle lark-cli-wait-user tool specially
        if (request.tool?.name === 'lark-cli-wait-user') {
          const backend = getSandboxBackend(request.runtime)
          const args = request.toolCall?.args as { deviceCode?: string; maxWaitSeconds?: number } | undefined
          
          if (backend && args?.deviceCode) {
            const response = await this.larkBootstrapService.waitForUserLogin(
              backend,
              args.deviceCode,
              args.maxWaitSeconds ?? 60
            )
            return new ToolMessage({
              content: JSON.stringify(response),
              tool_call_id: request.toolCall?.id ?? ''
            })
          }
          // Fallback if backend or deviceCode not available
          return new ToolMessage({
            content: JSON.stringify({
              success: false,
              identityType: 'none',
              waitedSeconds: 0,
              message: 'Sandbox backend not available or deviceCode missing.'
            }),
            tool_call_id: request.toolCall?.id ?? ''
          })
        }

        if (!isSandboxShellTool(request.tool)) {
          return handler(request)
        }

        const command = getSandboxShellCommand(request)
        if (!this.larkBootstrapService.isLarkCliCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.larkBootstrapService.ensureBootstrap(backend)
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
