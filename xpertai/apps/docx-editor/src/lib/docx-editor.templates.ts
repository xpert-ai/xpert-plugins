import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  DOCX_EDITOR_AGENT_KEY,
  DOCX_EDITOR_AGENT_REVIEW_CAPABILITY,
  DOCX_EDITOR_ASSISTANT_TEMPLATE_KEY,
  DOCX_EDITOR_FEATURE,
  DOCX_EDITOR_PLUGIN_NAME,
  DOCX_EDITOR_PROVIDER_KEY,
  DOCX_EDITOR_TEMPLATE_CAPABILITY,
  DOCX_EDITOR_TEMPLATE_PROVIDER_KEY,
  DOCX_EDITOR_WORKBENCH_CAPABILITY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DOCX_EDITOR_TEMPLATE_FILE = 'xpert-docx-editor-assistant.yaml'
const docxEditorSkillDependencies = [
  {
    componentKey: 'docx-editor',
    targetAgentKey: DOCX_EDITOR_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(__dirname, '..', DOCX_EDITOR_TEMPLATE_FILE),
    join(__dirname, DOCX_EDITOR_TEMPLATE_FILE),
    join(process.cwd(), 'apps/docx-editor/src', DOCX_EDITOR_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/docx-editor/src', DOCX_EDITOR_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/docx-editor', DOCX_EDITOR_TEMPLATE_FILE)
  ]
}

function readDocxEditorDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`DOCX Editor xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const docxEditorTemplates: XpertTemplateContribution[] = [
  {
    key: DOCX_EDITOR_ASSISTANT_TEMPLATE_KEY,
    name: 'DOCX Editor Assistant',
    title: 'DOCX 文档审阅助手',
    description: '面向 DOCX 上传、在线编辑、批注、修订建议和版本化保存的 data-xpert 文档助手模板。',
    category: 'Documents',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [DOCX_EDITOR_FEATURE, DOCX_EDITOR_WORKBENCH_CAPABILITY, DOCX_EDITOR_AGENT_REVIEW_CAPABILITY],
        requiredPlugins: [DOCX_EDITOR_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'docx-editor',
          managedBy: 'data-xpert',
          viewProvider: DOCX_EDITOR_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [DOCX_EDITOR_FEATURE, DOCX_EDITOR_WORKBENCH_CAPABILITY, DOCX_EDITOR_AGENT_REVIEW_CAPABILITY],
        requiredPlugins: [DOCX_EDITOR_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [DOCX_EDITOR_PLUGIN_NAME],
      skills: docxEditorSkillDependencies
    },
    dslContent: readDocxEditorDsl(),
    order: 70,
    default: false,
    startPrompts: [
      '请打开 DOCX Editor 工作台，我要上传一份合同进行审阅。',
      '请读取当前 DOCX 文档，并给关键风险条款添加批注。',
      '请根据我的要求对当前 DOCX 文档提出修订建议，保留可接受/拒绝的修订痕迹。',
      '请总结当前文档的批注和修订，列出还需要人工确认的问题。'
    ],
    releaseNotes: '创建 DOCX 文档审阅和编辑助手。',
    xpertName: 'DOCX 文档审阅助手',
    providerKey: DOCX_EDITOR_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
