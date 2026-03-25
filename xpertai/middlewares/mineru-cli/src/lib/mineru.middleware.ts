import { SystemMessage } from '@langchain/core/messages'
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
import { MinerUBootstrapService } from './mineru-bootstrap.service.js'
import {
  MINERU_CLI_SKILL_MIDDLEWARE_NAME,
  MinerUCliConfig,
  MinerUCliConfigFormSchema
} from './mineru-cli.types.js'
import { MinerUIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(MINERU_CLI_SKILL_MIDDLEWARE_NAME)
export class MinerUCLISkillMiddleware implements IAgentMiddlewareStrategy<Partial<MinerUCliConfig>> {
  constructor(private readonly mineruBootstrapService: MinerUBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: MINERU_CLI_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'MinerU CLI Skill',
      zh_Hans: 'MinerU CLI 技能'
    },
    description: {
      en_US: 'Bootstraps the MinerU Python CLI skill into the sandbox, securely provisions MINERU_TOKEN, and teaches the agent how to convert documents through sandbox_shell.',
      zh_Hans: '将 MinerU Python CLI skill 写入 sandbox，安全下发 MINERU_TOKEN，并指导智能体通过 sandbox_shell 转换文档。'
    },
    icon: {
      type: 'svg',
      value: MinerUIcon
    },
    configSchema: MinerUCliConfigFormSchema
  }

  createMiddleware(options: Partial<MinerUCliConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.mineruBootstrapService.resolveConfig(options)

    return {
      name: MINERU_CLI_SKILL_MIDDLEWARE_NAME,
      tools: [],
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        if (backend) {
          await this.mineruBootstrapService.ensureBootstrap(backend)
          await this.mineruBootstrapService.syncApiTokenSecret(backend, config)
        }
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.mineruBootstrapService.buildSystemPrompt()
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
        if (!this.mineruBootstrapService.isMinerUCommand(command)) {
          return handler(request)
        }

        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.mineruBootstrapService.ensureBootstrap(backend)
          await this.mineruBootstrapService.syncApiTokenSecret(backend, config)
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
