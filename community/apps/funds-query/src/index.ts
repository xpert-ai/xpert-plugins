import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod/v3'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { JsonSchemaObjectType, PluginMarketplaceAppConfig } from '@xpert-ai/contracts'
import { FundsService } from './lib/service.js'
import { PythonClient, type RuntimeConfig } from './lib/python-client.js'
import { FundsMiddleware } from './lib/middleware.js'
import { FundsView } from './lib/view.js'
import {
  CONFIG,
  PLUGIN_NAME,
  TEMPLATE,
  FEATURE,
  MIDDLEWARE,
  PROVIDER,
  VIEW,
  ICON
} from './lib/constants.js'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  xpert: { plugin: { level: 'tenant'; artifactNamespace: string } }
}
const schema = z
  .object({
    pythonExecutable: z.string().trim().min(1).default('auto'),
    dataDirectory: z.string().trim().min(1).default(join(homedir(), '.local/share/xpert-funds-query')),
    timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    debug: z.boolean().default(false)
  })
  .strict()
const text = (value: string) => ({ zh_Hans: value, en_US: value })
const configForm = {
  type: 'object',
  properties: {
    pythonExecutable: {type: 'string', title: text('Python 解释器'), default: 'auto',
      description: text('填写 auto 自动检测 Python 3.11+。也可填写服务器上的解释器命令或绝对路径。')},
    dataDirectory: {type: 'string', title: text('持久化数据目录'),
      description: text('填写服务器上的可写目录，升级与重启后继续使用同一目录。')},
    timeoutMs: {type: 'number', title: text('分析超时毫秒数'), minimum: 1000, maximum: 120000, default: 30000},
    debug: {type: 'boolean', title: text('启用运行诊断日志'), default: false}
  }
} satisfies JsonSchemaObjectType
export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: TEMPLATE,
  workspace: { mode: 'dedicated', name: text('资金交易问数工作空间'), sharing: 'organization' },
  modelRequirements: { primary: true },
  presentation: {
    tagline: text('让每一个数字都有依据'),
    longDescription: text(
      '上传标准交易 Excel，通过自然语言统计收支、筛选明细、查看排行和趋势。统计结果可以下钻到原始行。'
    ),
    developer: 'Community',
    features: [
      {
        key: 'evidence',
        title: text('答案可核验'),
        description: text('精确到分的统计与可分页查看的原始交易。')
      }
    ],
    useCases: [text('日常账户收支核对'), text('交易对手与趋势分析')],
    initializationSummary: text(
      '创建专用工作空间并发布资金问数助手。打开工作台时自动检查 Python，分析依赖随安装包提供。'
    ),
    initializationSteps: [
      text('检查可用语言模型'),
      text('创建应用工作空间'),
      text('安装并发布助手模板')
    ]
  },
  entry: { type: 'assistant-chat' }
} satisfies PluginMarketplaceAppConfig

@XpertServerPlugin({ providers: [PythonClient, FundsService, FundsMiddleware, FundsView] })
export class FundsQueryPlugin {}

const plugin: XpertPlugin<z.input<typeof schema>> = {
  meta: {
    name: manifest.name,
    version: manifest.version,
    level: manifest.xpert.plugin.level,
    artifactNamespace: manifest.xpert.plugin.artifactNamespace,
    category: 'middleware',
    displayName: '资金交易问数',
    description: 'Python 精确统计与 Vue 工作台驱动的 AI 交易问数应用。',
    author: 'Community',
    icon: ICON,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'workbench-view', 'assistant-tool', 'assistant-template'],
        capabilities: [FEATURE],
        marketplace: {
          category: 'productivity',
          contents: [
            {
              type: 'app',
              name: 'funds-query',
              displayName: '资金交易问数',
              description: text('导入、问数、核对原始交易。'),
              icon: ICON,
              appConfig
            }
          ]
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE],
          viewProviders: [PROVIDER],
          templateProviders: [TEMPLATE]
        }
      }
    }
  },
  config: {
    schema,
    formSchema: configForm,
    defaults: {
      pythonExecutable: process.env.FUNDS_QUERY_PYTHON || 'auto',
      dataDirectory: process.env.FUNDS_QUERY_DATA_DIR || join(homedir(), '.local/share/xpert-funds-query'),
      timeoutMs: 30000,
      debug: false
    }
  },
  templates: [
    {
      key: TEMPLATE,
      name: TEMPLATE,
      title: '资金交易问数助手',
      description: text('理解查询条件，调用精确统计工具，并解释可核验的结果。'),
      category: 'finance',
      targetApps: ['xpert'],
      targetAppMeta: {
        xpert: {
          types: ['business-assistant'],
          capabilities: [FEATURE],
          requiredPlugins: [PLUGIN_NAME]
        }
      },
      dependencies: { plugins: [PLUGIN_NAME] },
      dslContent: readFileSync(new URL('./funds-query-assistant.yaml', import.meta.url), 'utf8'),
      startPrompts: [
        '张三上个月收了多少钱？',
        '谁给张三转账最多？列出前五名。',
        '按天展示这个账户的收款趋势。'
      ],
      xpertName: '资金交易问数助手'
    }
  ],
  register(ctx) {
    const config = schema.parse(ctx.config)
    return {
      module: FundsQueryPlugin,
      global: true,
      providers: [
        { provide: CONFIG, useValue: { ...config, dataDirectory: resolve(config.dataDirectory) } }
      ]
    }
  }
}
export default plugin
export { FundsMiddleware, FundsView, FundsService, PythonClient, VIEW }
