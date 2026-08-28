import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

export type CtripWendaoAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type CtripWendaoAgentToolFactory = <TInput>(
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
) => CtripWendaoAgentTool

export const defineCtripWendaoAgentTool = tool as unknown as CtripWendaoAgentToolFactory
