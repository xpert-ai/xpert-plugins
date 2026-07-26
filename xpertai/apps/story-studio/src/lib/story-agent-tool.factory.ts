import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

type StoryAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type StoryAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<string>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors: true
  }
) => StoryAgentTool

/**
 * Erases LangChain's recursive schema generic once at the SDK boundary while
 * retaining the exact runtime Zod schema and typed handler input.
 */
export const defineStoryAgentTool =
  tool as unknown as StoryAgentToolFactory
