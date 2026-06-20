import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  DRAWIO_AGENT_DRAWING_CAPABILITY,
  DRAWIO_FEATURE,
  DRAWIO_PLUGIN_NAME,
  DRAWIO_PROVIDER_KEY,
  DRAWIO_TEMPLATE_CAPABILITY,
  DRAWIO_TEMPLATE_PROVIDER_KEY,
  DRAWIO_WORKBENCH_CAPABILITY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DRAWIO_TEMPLATE_KEY = 'drawio-assistant'
const DRAWIO_TEMPLATE_FILE = 'xpert-drawio-assistant.yaml'
const DRAWIO_AGENT_KEY = 'Agent_Drawio'
const drawioSkillDependencies = [
  {
    componentKey: 'index',
    targetAgentKey: DRAWIO_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(__dirname, '..', DRAWIO_TEMPLATE_FILE),
    join(__dirname, DRAWIO_TEMPLATE_FILE),
    join(process.cwd(), 'apps/drawio/src', DRAWIO_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/drawio/src', DRAWIO_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/drawio', DRAWIO_TEMPLATE_FILE)
  ]
}

function readDrawioDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`draw.io xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const drawioTemplates: XpertTemplateContribution[] = [
  {
    key: DRAWIO_TEMPLATE_KEY,
    name: 'draw.io Drawing Assistant',
    title: 'draw.io 绘图助手',
    description: '面向流程图、架构图、线框图和自由白板的 data-xpert draw.io 绘图助手模板。',
    category: 'draw.io',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [DRAWIO_FEATURE, DRAWIO_WORKBENCH_CAPABILITY, DRAWIO_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [DRAWIO_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'drawio',
          managedBy: 'data-xpert',
          viewProvider: DRAWIO_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [DRAWIO_FEATURE, DRAWIO_WORKBENCH_CAPABILITY, DRAWIO_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [DRAWIO_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [DRAWIO_PLUGIN_NAME],
      skills: drawioSkillDependencies
    },
    dslContent: readDrawioDsl(),
    order: 60,
    default: false,
    startPrompts: [
      '请根据我的系统说明创建一张可编辑的架构图。',
      '请把下面的流程描述转成 draw.io 图形，并保存 Mermaid 草稿。',
      '请读取当前 draw.io 图形版本，根据我的反馈调整布局和标注。',
      '请导入这段 Mermaid，并生成一版可在工作台里继续编辑的 XML 图形。'
    ],
    releaseNotes: '创建 draw.io Agentic Drawing 业务助手。',
    xpertName: 'draw.io 绘图助手',
    providerKey: DRAWIO_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
