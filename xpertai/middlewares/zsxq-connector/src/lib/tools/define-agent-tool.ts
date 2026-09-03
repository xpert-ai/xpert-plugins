import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

type PluginAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type PluginAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<unknown>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors: true
    metadata: {
      toolName: { en_US: string; zh_Hans: string }
      toolIcon?: { type: 'font' | 'svg' | 'image' | 'emoji' | 'lottie'; value: string; color?: string; alt?: string }
    }
  }
) => PluginAgentTool

// LangChain carries every schema generic into heterogeneous tool arrays. Erase only
// that redundant generic at the SDK boundary while keeping runtime Zod validation.
export const defineAgentTool = tool as unknown as PluginAgentToolFactory
