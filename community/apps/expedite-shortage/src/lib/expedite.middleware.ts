/**
 * Agent 中间件：把业务能力以“工具”的形式交给助手调用。
 *
 * 阶段 2 只是空壳（不提供任何工具），用来证明平台能发现并加载这个中间件；
 * 阶段 4 再加入 7 个分析工具。
 * Python 类比：一个注册到插件系统里的类，平台按名字找到它，调用 create_middleware() 拿到工具列表。
 */
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { EXPEDITE_FEATURE, MIDDLEWARE_NAME, PLUGIN_ICON } from './constants.js'

/** 中间件选项：本版没有可配置项 */
export type ExpediteMiddlewareOptions = Record<string, never>

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class ExpediteShortageMiddleware implements IAgentMiddlewareStrategy<ExpediteMiddlewareOptions> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Expedite shortage analysis', zh_Hans: '提前交货缺料分析' },
    description: {
      en_US: 'Tools for analysing material shortages of an expedite request.',
      zh_Hans: '为提前交货请求做缺料分析的工具集。'
    },
    // 工具族的默认图标只在这里定义一次，工具本身不再单独设置
    icon: PLUGIN_ICON,
    features: [EXPEDITE_FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  /** 静态声明本中间件提供的工具名（阶段 2 为空） */
  getToolNames(): readonly string[] {
    return []
  }

  createMiddleware(): AgentMiddleware {
    return { name: MIDDLEWARE_NAME, tools: [] }
  }
}
