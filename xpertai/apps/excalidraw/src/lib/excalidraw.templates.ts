import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_PLUGIN_NAME,
  EXCALIDRAW_PROVIDER_KEY,
  EXCALIDRAW_TEMPLATE_CAPABILITY,
  EXCALIDRAW_TEMPLATE_PROVIDER_KEY,
  EXCALIDRAW_WORKBENCH_CAPABILITY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const EXCALIDRAW_TEMPLATE_KEY = 'excalidraw-assistant'
const EXCALIDRAW_TEMPLATE_FILE = 'xpert-excalidraw-assistant.yaml'
const EXCALIDRAW_AGENT_KEY = 'Agent_Excalidraw'
const excalidrawSkillDependencies = [
  {
    componentKey: 'index',
    targetAgentKey: EXCALIDRAW_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(__dirname, '..', EXCALIDRAW_TEMPLATE_FILE),
    join(__dirname, EXCALIDRAW_TEMPLATE_FILE),
    join(process.cwd(), 'apps/excalidraw/src', EXCALIDRAW_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/excalidraw/src', EXCALIDRAW_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/excalidraw', EXCALIDRAW_TEMPLATE_FILE)
  ]
}

function readExcalidrawDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Excalidraw xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const excalidrawTemplates: XpertTemplateContribution[] = [
  {
    key: EXCALIDRAW_TEMPLATE_KEY,
    name: 'Excalidraw Drawing Assistant',
    title: 'Excalidraw 绘图助手',
    description: '面向流程图、架构图、线框图和自由白板的 data-xpert 绘图助手模板。',
    category: 'Excalidraw',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [EXCALIDRAW_FEATURE, EXCALIDRAW_WORKBENCH_CAPABILITY, EXCALIDRAW_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [EXCALIDRAW_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'excalidraw',
          managedBy: 'data-xpert',
          viewProvider: EXCALIDRAW_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [EXCALIDRAW_FEATURE, EXCALIDRAW_WORKBENCH_CAPABILITY, EXCALIDRAW_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [EXCALIDRAW_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [EXCALIDRAW_PLUGIN_NAME],
      skills: excalidrawSkillDependencies
    },
    dslContent: readExcalidrawDsl(),
    order: 60,
    default: false,
    startPrompts: [
      '请根据我的系统说明创建一张可编辑的架构图。',
      '请把下面的流程描述转成 Excalidraw 图形，并保存 Mermaid 草稿。',
      '请读取当前图形版本，根据我的反馈调整布局和标注。',
      '请导入这段 Mermaid，并生成一版可在工作台里继续编辑的图。'
    ],
    releaseNotes: '创建 Excalidraw Agentic Drawing 业务助手。',
    xpertName: 'Excalidraw 绘图助手',
    providerKey: EXCALIDRAW_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
