import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  OFFICE_CLI_AGENT_CAPABILITY,
  OFFICE_CLI_AGENT_KEY,
  OFFICE_CLI_ASSISTANT_TEMPLATE_KEY,
  OFFICE_CLI_FEATURE,
  OFFICE_CLI_PLUGIN_NAME,
  OFFICE_CLI_PROVIDER_KEY,
  OFFICE_CLI_RENDERING_CAPABILITY,
  OFFICE_CLI_TEMPLATE_PROVIDER_KEY,
  OFFICE_CLI_VERSIONING_CAPABILITY,
  OFFICE_CLI_WORKBENCH_CAPABILITY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const templateFile = 'xpert-office-cli-assistant.yaml'

function readTemplate() {
  const candidates = [
    join(moduleDir, '..', templateFile),
    join(moduleDir, templateFile),
    join(process.cwd(), 'apps/office-cli/src', templateFile),
    join(process.cwd(), 'xpertai/apps/office-cli/src', templateFile)
  ]
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`OfficeCLI Assistant template was not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

const capabilities = [
  OFFICE_CLI_FEATURE,
  OFFICE_CLI_WORKBENCH_CAPABILITY,
  OFFICE_CLI_AGENT_CAPABILITY,
  OFFICE_CLI_RENDERING_CAPABILITY,
  OFFICE_CLI_VERSIONING_CAPABILITY
]

export const officeCliTemplates: XpertTemplateContribution[] = [
  {
    key: OFFICE_CLI_ASSISTANT_TEMPLATE_KEY,
    name: 'OfficeCLI Assistant',
    title: 'OfficeCLI 原生 Office 助手',
    description: '使用 OfficeCLI 原生处理、渲染和编辑 DOCX、XLSX 与 PPTX 文件。',
    category: 'Productivity',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities,
        requiredPlugins: [OFFICE_CLI_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'office-cli',
          managedBy: 'data-xpert',
          viewProvider: OFFICE_CLI_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities,
        requiredPlugins: [OFFICE_CLI_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [OFFICE_CLI_PLUGIN_NAME],
      skills: [{
        componentKey: 'officecli',
        targetAgentKey: OFFICE_CLI_AGENT_KEY
      }]
    },
    dslContent: readTemplate(),
    order: 73,
    default: false,
    startPrompts: [
      '请创建一个原生 DOCX 文档并打开 OfficeCLI 工作台。',
      '请检查当前 Office 文件的结构和格式问题。',
      '请修改我在 OfficeCLI 预览中选中的元素。',
      '请验证当前文件并返回最新可下载版本。'
    ],
    releaseNotes: '创建 OfficeCLI 原生 Office 助手。',
    xpertName: 'OfficeCLI 原生 Office 助手',
    providerKey: OFFICE_CLI_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
