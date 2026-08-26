import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

export type NeteaseMailAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type NeteaseMailAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<unknown>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors: true
  }
) => NeteaseMailAgentTool

// LangChain retains every recursive Zod generic across heterogeneous tool arrays.
export const defineNeteaseMailAgentTool = tool as unknown as NeteaseMailAgentToolFactory
