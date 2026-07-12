import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  PRESENTATION_AGENT_KEY,
  PRESENTATION_ASSISTANT_TEMPLATE_KEY,
  PRESENTATION_COLLABORATION_CAPABILITY,
  PRESENTATION_EXPORT_CAPABILITY,
  PRESENTATION_FEATURE,
  PRESENTATION_GENERATION_CAPABILITY,
  PRESENTATION_PLUGIN_NAME,
  PRESENTATION_PROVIDER_KEY,
  PRESENTATION_TEMPLATE_PROVIDER_KEY,
  PRESENTATION_WORKBENCH_CAPABILITY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const templateFile = 'xpert-presentation-studio-assistant.yaml'
function readDsl() {
  const candidates = [
    join(moduleDir, '..', templateFile), join(moduleDir, templateFile),
    join(process.cwd(), 'apps/presentation-studio/src', templateFile),
    join(process.cwd(), 'xpertai/apps/presentation-studio/src', templateFile),
    join(process.cwd(), 'dist/apps/presentation-studio', templateFile)
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Presentation Studio DSL template not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

const capabilities = [PRESENTATION_FEATURE, PRESENTATION_GENERATION_CAPABILITY, PRESENTATION_WORKBENCH_CAPABILITY, PRESENTATION_COLLABORATION_CAPABILITY, PRESENTATION_EXPORT_CAPABILITY]
export const presentationStudioTemplates: XpertTemplateContribution[] = [{
  key: PRESENTATION_ASSISTANT_TEMPLATE_KEY,
  name: 'Presentation Studio Assistant',
  title: '演示文稿生成助手',
  description: '基于 DashiAI 12 套主题和 1020 个版式的人机协作演示文稿助手。',
  category: 'Productivity',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert', 'xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-assistant'], capabilities, requiredPlugins: [PRESENTATION_PLUGIN_NAME],
      defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'presentation-studio', managedBy: 'data-xpert', viewProvider: PRESENTATION_PROVIDER_KEY }
    },
    xpert: { types: ['assistant-template'], capabilities, requiredPlugins: [PRESENTATION_PLUGIN_NAME] }
  },
  dependencies: { plugins: [PRESENTATION_PLUGIN_NAME], skills: [{ componentKey: 'presentation-studio-agent-skill', targetAgentKey: PRESENTATION_AGENT_KEY }] },
  dslContent: readDsl(),
  order: 73,
  default: false,
  startPrompts: [
    '请基于这份结构化材料生成一份 10 页项目汇报演示稿。',
    '为这次产品发布选择合适主题和版式，并生成可编辑 PPTX。',
    '请检查当前演示稿的文案预算、版式和媒体引用后保存版本。',
    '将当前演示稿导出为 HTML、PDF 和 PPTX。'
  ],
  releaseNotes: 'Created the Presentation Studio Agentic App assistant.',
  xpertName: '演示文稿生成助手',
  providerKey: PRESENTATION_TEMPLATE_PROVIDER_KEY
} as XpertTemplateContribution]
