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
    verboseParsingErrors?: boolean
  }
) => PluginAgentTool

// LangChain's overloaded tool type retains every schema generic; erase it once at the SDK boundary.
export const defineAgentTool = tool as unknown as PluginAgentToolFactory
