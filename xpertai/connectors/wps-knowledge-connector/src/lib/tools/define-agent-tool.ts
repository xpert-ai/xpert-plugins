import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

type PluginAgentTool = NonNullable<AgentMiddleware['tools']>[number]
type PluginAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<unknown>,
  fields: { name: string; description: string; schema: z.ZodTypeAny; verboseParsingErrors?: boolean }
) => PluginAgentTool

// Keep the strict runtime schema while preventing LangChain's recursive schema generic from expanding the SDK array.
export const defineAgentTool = tool as unknown as PluginAgentToolFactory
