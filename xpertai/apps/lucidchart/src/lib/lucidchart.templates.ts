import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  LUCIDCHART_AGENT_DRAWING_CAPABILITY,
  LUCIDCHART_FEATURE,
  LUCIDCHART_PLUGIN_NAME,
  LUCIDCHART_PROVIDER_KEY,
  LUCIDCHART_TEMPLATE_CAPABILITY,
  LUCIDCHART_TEMPLATE_PROVIDER_KEY,
  LUCIDCHART_WORKBENCH_CAPABILITY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const LUCIDCHART_TEMPLATE_KEY = 'lucidchart-assistant'
const LUCIDCHART_TEMPLATE_FILE = 'xpert-lucidchart-assistant.yaml'
const LUCIDCHART_AGENT_KEY = 'Agent_Lucidchart'
const lucidchartSkillDependencies = [
  {
    componentKey: 'index',
    targetAgentKey: LUCIDCHART_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(__dirname, '..', LUCIDCHART_TEMPLATE_FILE),
    join(__dirname, LUCIDCHART_TEMPLATE_FILE),
    join(process.cwd(), 'apps/lucidchart/src', LUCIDCHART_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/lucidchart/src', LUCIDCHART_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/lucidchart', LUCIDCHART_TEMPLATE_FILE)
  ]
}

function readLucidchartDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Lucidchart xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const lucidchartTemplates: XpertTemplateContribution[] = [
  {
    key: LUCIDCHART_TEMPLATE_KEY,
    name: 'Lucidchart Drawing Assistant',
    title: 'Lucidchart 绘图助手',
    description: '面向 Lucidchart Standard Import 草稿、Mermaid 草稿和外部 Lucid 文档登记的 data-xpert 绘图助手模板。',
    category: 'Lucidchart',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [LUCIDCHART_FEATURE, LUCIDCHART_WORKBENCH_CAPABILITY, LUCIDCHART_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [LUCIDCHART_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'lucidchart',
          managedBy: 'data-xpert',
          viewProvider: LUCIDCHART_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [LUCIDCHART_FEATURE, LUCIDCHART_WORKBENCH_CAPABILITY, LUCIDCHART_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [LUCIDCHART_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [LUCIDCHART_PLUGIN_NAME],
      skills: lucidchartSkillDependencies
    },
    dslContent: readLucidchartDsl(),
    order: 60,
    default: false,
    startPrompts: [
      '请根据我的系统说明创建一张可编辑的架构图。',
      '请把下面的流程描述转成 Lucidchart Standard Import 草稿。',
      '请读取当前 Lucidchart 文档版本，根据我的反馈调整 document.json。',
      '请保存这段 Mermaid 草稿，并说明后续如何导入 Lucidchart。'
    ],
    releaseNotes: '创建 Lucidchart Standard Import Agentic Drawing 业务助手。',
    xpertName: 'Lucidchart 绘图助手',
    providerKey: LUCIDCHART_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
