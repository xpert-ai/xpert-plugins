import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

type PluginAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type PluginAgentToolFactory = <TInput>(
  handler: (input: TInput, config: RunnableConfig) => Promise<object | string>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors: true
  }
) => PluginAgentTool

/**
 * One compatibility assertion keeps LangChain's recursive Zod overloads from
 * expanding through the SDK AgentMiddleware tool array.
 */
export const defineAgentTool = tool as unknown as PluginAgentToolFactory
