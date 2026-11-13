/**
 * LangChain tool() 的类型边界（skill general.md 的推荐写法）。
 *
 * tool() 有很多重载，直接把多个工具放进数组，TypeScript 会推导出非常庞大的类型，拖慢编译。
 * 这里只在一个地方把返回类型收窄为平台 SDK 的工具类型；运行时仍然是 LangChain 的 tool()，
 * schema 校验和 verboseParsingErrors 都照常生效。
 */
import { tool } from '@langchain/core/tools'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'

export type PluginAgentTool = NonNullable<AgentMiddleware['tools']>[number]

type PluginAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<string>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors?: boolean
    metadata?: Record<string, unknown>
  }
) => PluginAgentTool

export const defineAgentTool = tool as unknown as PluginAgentToolFactory
