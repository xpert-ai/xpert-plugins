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
import { MarkItDownBootstrapService } from './markitdown-bootstrap.service.js'
import {
  MARKITDOWN_SKILL_MIDDLEWARE_NAME,
  MarkItDownConfig,
  MarkItDownConfigFormSchema
} from './markitdown.types.js'
import { MarkItDownIcon } from './types.js'

const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

@Injectable()
@AgentMiddlewareStrategy(MARKITDOWN_SKILL_MIDDLEWARE_NAME)
export class MarkItDownSkillMiddleware implements IAgentMiddlewareStrategy<Partial<MarkItDownConfig>> {
  constructor(private readonly markitdownBootstrapService: MarkItDownBootstrapService) {}

  meta: TAgentMiddlewareMeta = {
    name: MARKITDOWN_SKILL_MIDDLEWARE_NAME,
    label: {
      en_US: 'MarkItDown Skill',
      zh_Hans: 'MarkItDown 技能'
    },
    description: {
      en_US: 'Installs Microsoft MarkItDown into the sandbox and teaches the agent to convert files (PDF, DOCX, PPTX, images, audio, etc.) to Markdown via sandbox_shell.',
      zh_Hans: '将 Microsoft MarkItDown 安装到 sandbox 中，并教会智能体通过 sandbox_shell 将文件（PDF、DOCX、PPTX、图片、音频等）转换为 Markdown。'
    },
    icon: {
      type: 'svg',
      value: MarkItDownIcon
    },
    configSchema: MarkItDownConfigFormSchema
  }

  createMiddleware(options: Partial<MarkItDownConfig>, _context: IAgentMiddlewareContext): AgentMiddleware {
    const config = this.markitdownBootstrapService.resolveConfig(options)

    return {
      name: MARKITDOWN_SKILL_MIDDLEWARE_NAME,
      tools: [],
      beforeAgent: async (_state, runtime) => {
        const backend = getSandboxBackend(runtime)
        await this.markitdownBootstrapService.ensureBootstrap(backend, config)
      },
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prompt = this.markitdownBootstrapService.buildSystemPrompt(config)
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, prompt].filter(Boolean).join('\n\n')

        return handler({
          ...request,
          systemMessage: new SystemMessage({
            content
          })
        })
      },
      wrapToolCall: async (
        request: ToolCallRequest<AgentBuiltInState>,
        handler
      ) => {
        if (!isSandboxShellTool(request.tool)) {
          return handler(request)
        }

        const command = getSandboxShellCommand(request)
        if (!this.markitdownBootstrapService.isMarkItDownCommand(command)) {
          return handler(request)
        }

        // Ensure markitdown is installed before running the command
        const backend = getSandboxBackend(request.runtime)
        if (backend) {
          await this.markitdownBootstrapService.ensureBootstrap(backend, config)
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
