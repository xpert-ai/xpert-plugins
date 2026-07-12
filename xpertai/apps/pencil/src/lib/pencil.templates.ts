import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  PENCIL_AGENT_CAPABILITY,
  PENCIL_FEATURE,
  PENCIL_PLUGIN_NAME,
  PENCIL_PROVIDER_KEY,
  PENCIL_TEMPLATE_CAPABILITY,
  PENCIL_TEMPLATE_PROVIDER_KEY,
  PENCIL_WORKBENCH_CAPABILITY
} from './constants.js'

const templateModuleFilename = fileURLToPath(import.meta.url)
const templateModuleDir = dirname(templateModuleFilename)
const PENCIL_TEMPLATE_KEY = 'pencil-assistant'
const PENCIL_TEMPLATE_FILE = 'xpert-pencil-assistant.yaml'
const PENCIL_LOGO_ASSET_PATH = './assets/logo.svg'
const PENCIL_AGENT_KEY = 'Agent_Pencil'
const VIEW_IMAGE_PLUGIN_NAME = '@xpert-ai/plugin-view-image'

type PencilTemplateContribution = XpertTemplateContribution & {
  dependencies?: NonNullable<XpertTemplateContribution['dependencies']>
}

const pencilSkillDependencies = [
  {
    componentKey: 'pencil-agent-skill',
    targetAgentKey: PENCIL_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(templateModuleDir, '..', PENCIL_TEMPLATE_FILE),
    join(templateModuleDir, PENCIL_TEMPLATE_FILE),
    join(process.cwd(), 'apps/pencil/src', PENCIL_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/pencil/src', PENCIL_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/pencil', PENCIL_TEMPLATE_FILE)
  ]
}

function getLogoCandidates() {
  return [
    join(templateModuleDir, '..', '..', 'assets', 'logo.svg'),
    join(process.cwd(), 'apps/pencil/assets/logo.svg'),
    join(process.cwd(), 'xpertai/apps/pencil/assets/logo.svg'),
    join(process.cwd(), 'assets/logo.svg')
  ]
}

function readPencilLogoDataUrl() {
  const logoPath = getLogoCandidates().find((candidate) => existsSync(candidate))
  if (!logoPath) {
    throw new Error(`Pencil logo asset file not found: ${getLogoCandidates().join(', ')}`)
  }
  return `data:image/svg+xml;base64,${readFileSync(logoPath).toString('base64')}`
}

const pencilLogoAvatar = {
  url: readPencilLogoDataUrl(),
  background: 'rgb(255, 255, 255)'
}

function readPencilDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Pencil xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8').replaceAll(PENCIL_LOGO_ASSET_PATH, pencilLogoAvatar.url)
}

export const pencilTemplates: PencilTemplateContribution[] = [
  {
    key: PENCIL_TEMPLATE_KEY,
    name: 'Pencil Assistant',
    title: 'Pencil Assistant',
    description: 'A data-xpert design assistant template for Pencil documents, Figma imports, node edits, exports, and reviewable versions.',
    category: 'Design',
    avatar: pencilLogoAvatar,
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [PENCIL_FEATURE, PENCIL_WORKBENCH_CAPABILITY, PENCIL_AGENT_CAPABILITY],
        requiredPlugins: [PENCIL_PLUGIN_NAME, VIEW_IMAGE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'pencil',
          managedBy: 'data-xpert',
          viewProvider: PENCIL_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [PENCIL_FEATURE, PENCIL_WORKBENCH_CAPABILITY, PENCIL_AGENT_CAPABILITY, PENCIL_TEMPLATE_CAPABILITY],
        requiredPlugins: [PENCIL_PLUGIN_NAME, VIEW_IMAGE_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [PENCIL_PLUGIN_NAME, VIEW_IMAGE_PLUGIN_NAME],
      skills: pencilSkillDependencies
    },
    dslContent: readPencilDsl(),
    order: 59,
    default: false,
    startPrompts: [
      'Create a new Pencil design document for this interface.',
      'Create a realistic Pencil sample dashboard with complex auto-layout.',
      'Import this .fig file and summarize the design structure.',
      'Use the current Pencil selection and update the selected nodes.',
      'Export the current Pencil document to SVG and FIG workspace files.'
    ],
    releaseNotes: 'Created the Pencil Agentic App assistant.',
    xpertName: 'Pencil Assistant',
    providerKey: PENCIL_TEMPLATE_PROVIDER_KEY
  }
]
