import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

type CanvasAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type CanvasAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<unknown>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors?: boolean
  }
) => CanvasAgentTool

/**
 * Keep the real Zod runtime contract while erasing LangChain's recursive schema generic once at the SDK boundary.
 * This is the narrow compatibility boundary recommended by the plugin development guide.
 */
export const defineCanvasAgentTool = tool as unknown as CanvasAgentToolFactory
