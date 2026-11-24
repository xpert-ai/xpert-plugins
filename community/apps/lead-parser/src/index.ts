import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  LEAD_PARSER_FEATURE,
  LEAD_PARSER_MIDDLEWARE_NAME,
  LEAD_PARSER_PLUGIN,
  LEAD_PARSER_PROVIDER_KEY,
  LEAD_PARSER_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { LeadParserPlugin } from './lib/lead-parser.plugin'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const LEAD_PARSER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="M15 3v5h5"/><path d="M8 9h5M8 13h4"/><circle cx="17" cy="16" r="3"/><path d="m19.2 18.2 2 2"/></svg>'

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name || LEAD_PARSER_PLUGIN,
    version: packageJson.version,
    level: 'organization',
    artifactNamespace: 'lead_parser',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [LEAD_PARSER_FEATURE, LEAD_PARSER_WORKBENCH_VIEW_KEY, LEAD_PARSER_MIDDLEWARE_NAME],
        runtime: {
          middlewareProviders: [LEAD_PARSER_MIDDLEWARE_NAME],
          viewProviders: [LEAD_PARSER_PROVIDER_KEY]
        },
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'lead_parser',
              displayName: '线索解析',
              description: '把销售线索原文解析为姓名、公司、意向、预算四个结构化字段，并支持人工确认后保存。',
              icon: { type: 'svg', value: LEAD_PARSER_ICON, color: '#2563eb' },
              operations: [
                {
                  name: 'parse-lead-text',
                  displayName: '解析线索文本',
                  description: '把一段线索原文解析为结构化字段，供人工复核。',
                  access: 'read'
                },
                {
                  name: 'save-parsed-lead',
                  displayName: '保存解析结果',
                  description: '人工确认后把结构化线索写入业务数据。',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: LEAD_PARSER_WORKBENCH_VIEW_KEY,
              displayName: '线索解析工作台',
              description: '粘贴线索原文，一键解析并在右侧核对四个字段，确认后保存。'
            },
            {
              type: 'tool',
              name: LEAD_PARSER_MIDDLEWARE_NAME,
              displayName: '线索解析工具',
              description: '提供 lead_parser_parse 工具，从线索文本中抽取姓名、公司、意向、预算。'
            },
            {
              type: 'assistant-template',
              name: 'lead-parser-assistant',
              displayName: '线索解析助手',
              description: '绑定线索解析中间件与工作台视图的数字专家模板：对话中解析线索文本，工作台中确认并保存。'
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: LEAD_PARSER_ICON, color: '#2563eb' },
    displayName: { en_US: 'Lead Parser', zh_Hans: '线索解析' },
    description: {
      en_US: 'Parse raw sales lead text into structured fields through an Agent tool and a Workbench view.',
      zh_Hans: '通过 Agent 工具与工作台视图，把销售线索原文解析为结构化字段。'
    },
    keywords: ['lead', 'crm', 'sales', 'parser', 'workbench', 'agent'],
    author: 'Zhang Jinpeng'
  },
  register(ctx) {
    ctx.logger.log('register lead-parser plugin')
    return { module: LeadParserPlugin, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('lead-parser plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('lead-parser plugin stopped')
  }
}

export default plugin
