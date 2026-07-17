import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CUT_AGENT_CAPABILITY,
  CUT_FEATURE,
  CUT_PLUGIN_NAME,
  CUT_PROVIDER_KEY,
  CUT_TEMPLATE_PROVIDER_KEY,
  CUT_WORKBENCH_CAPABILITY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const templateFile = 'xpert-cut-assistant.yaml'

function readCutDsl() {
  const candidates = [
    join(moduleDir, '..', templateFile),
    join(moduleDir, templateFile),
    join(process.cwd(), 'apps/cut/src', templateFile),
    join(process.cwd(), 'xpertai/apps/cut/src', templateFile),
    join(process.cwd(), 'dist/apps/cut', templateFile)
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`Cut assistant template was not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

export const cutTemplates: XpertTemplateContribution[] = [
  {
    key: 'cut-assistant',
    name: 'Cut Assistant',
    title: 'Cut Assistant',
    description: 'Agentic assistant for importing and searching media evidence, reviewable rough-cut proposals, deterministic timeline editing, captions, versioning, and browser or headless MP4 export.',
    category: 'Video',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [CUT_FEATURE, CUT_WORKBENCH_CAPABILITY, CUT_AGENT_CAPABILITY],
        requiredPlugins: [CUT_PLUGIN_NAME],
        defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'cut', managedBy: 'data-xpert', viewProvider: CUT_PROVIDER_KEY }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [CUT_FEATURE, CUT_WORKBENCH_CAPABILITY, CUT_AGENT_CAPABILITY],
        requiredPlugins: [CUT_PLUGIN_NAME]
      }
    },
    dependencies: { plugins: [CUT_PLUGIN_NAME], skills: [{ componentKey: 'cut-agent-skill', targetAgentKey: 'Agent_Cut' }] },
    dslContent: readCutDsl(),
    order: 64,
    default: false,
    startPrompts: [
      'Create a 30-second 1080p Cut project for this brief.',
      'Import the attached media and build a rough cut.',
      'Transcribe the imported interview, let me review the captions, then commit them.',
      'Remove filler words and long pauses, add bilingual Chinese-English captions and a cover, then prepare a formal MP4 export.',
      'Find every pricing mention and long pause in the analyzed interview with exact time ranges.',
      'Create an evidence-backed 60-second rough-cut proposal, show me the diff, and wait for approval before applying it.',
      'Split the selected clip at five seconds and trim the second half.',
      'Review the current timeline and prepare it for MP4 export.',
      'Render approved 16:9, 9:16, and 1:1 MP4 variants in the background.'
    ],
    releaseNotes: 'Created the Cut Agentic App assistant.',
    xpertName: 'Cut Assistant',
    providerKey: CUT_TEMPLATE_PROVIDER_KEY
  }
]
