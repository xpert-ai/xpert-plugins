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
    }
  }
) => PluginAgentTool

// LangChain retains every schema generic in this overload; erase it once at the SDK boundary.
export const defineAgentTool = tool as unknown as PluginAgentToolFactory
