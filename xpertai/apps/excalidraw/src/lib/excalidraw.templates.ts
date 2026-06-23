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
    title: 'Excalidraw Drawing Assistant',
    description: 'A data-xpert drawing assistant template for flowcharts, architecture diagrams, wireframes, and freeform whiteboards.',
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
      'Create an editable architecture diagram from my system description.',
      'Create an editable process diagram from my description using Excalidraw elements.',
      'Read the current drawing version and adjust the layout and annotations based on my feedback.',
      'Import this Mermaid source only as a draft, then refine it with editable Excalidraw elements.'
    ],
    releaseNotes: 'Created the Excalidraw Agentic Drawing business assistant.',
    xpertName: 'Excalidraw Drawing Assistant',
    providerKey: EXCALIDRAW_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
