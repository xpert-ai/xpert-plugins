import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  OFFICE_EDITOR_AGENT_KEY,
  OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY,
  OFFICE_EDITOR_ASSISTANT_TEMPLATE_KEY,
  OFFICE_EDITOR_COLLABORATION_CAPABILITY,
  OFFICE_EDITOR_FEATURE,
  OFFICE_EDITOR_PLUGIN_NAME,
  OFFICE_EDITOR_PROVIDER_KEY,
  OFFICE_EDITOR_TEMPLATE_CAPABILITY,
  OFFICE_EDITOR_TEMPLATE_PROVIDER_KEY,
  OFFICE_EDITOR_WORKBENCH_CAPABILITY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const OFFICE_EDITOR_TEMPLATE_FILE = 'xpert-office-editor-assistant.yaml'
const officeEditorSkillDependencies = [
  {
    componentKey: 'office-editor',
    targetAgentKey: OFFICE_EDITOR_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(moduleDir, '..', OFFICE_EDITOR_TEMPLATE_FILE),
    join(moduleDir, OFFICE_EDITOR_TEMPLATE_FILE),
    join(process.cwd(), 'apps/office-editor/src', OFFICE_EDITOR_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/office-editor/src', OFFICE_EDITOR_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/office-editor', OFFICE_EDITOR_TEMPLATE_FILE)
  ]
}

function readOfficeEditorDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Office Editor xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const officeEditorTemplates: XpertTemplateContribution[] = [
  {
    key: OFFICE_EDITOR_ASSISTANT_TEMPLATE_KEY,
    name: 'Office Editor Assistant',
    title: 'Office 协作编辑助手',
    description: '面向 XLSX 自动化编辑与 Univer 原生文档、演示稿协作的助手模板。',
    category: 'Productivity',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [OFFICE_EDITOR_FEATURE, OFFICE_EDITOR_WORKBENCH_CAPABILITY, OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY, OFFICE_EDITOR_COLLABORATION_CAPABILITY],
        requiredPlugins: [OFFICE_EDITOR_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'office-editor',
          managedBy: 'data-xpert',
          viewProvider: OFFICE_EDITOR_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [OFFICE_EDITOR_FEATURE, OFFICE_EDITOR_WORKBENCH_CAPABILITY, OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY, OFFICE_EDITOR_COLLABORATION_CAPABILITY],
        requiredPlugins: [OFFICE_EDITOR_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [OFFICE_EDITOR_PLUGIN_NAME],
      skills: officeEditorSkillDependencies
    },
    dslContent: readOfficeEditorDsl(),
    order: 72,
    default: false,
    startPrompts: [
      '请打开 Office Editor 工作台，我要创建一个协作电子表格。',
      '请读取当前 XLSX 文件，修改指定区域并返回新的 Excel 文件。',
      '请创建一份项目方案文档，并把需要我确认的修改排队到工作台。',
      '请基于这些要点生成一个演示稿大纲。',
      '请读取当前 Office 文档，总结待人工确认的 Agent 操作。'
    ],
    releaseNotes: '创建 Univer Office 协作编辑助手。',
    xpertName: 'Office 协作编辑助手',
    providerKey: OFFICE_EDITOR_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
