import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  MOTION_AGENT_CAPABILITY,
  MOTION_FEATURE,
  MOTION_LIBRARY_CAPABILITY,
  MOTION_PLUGIN_NAME,
  MOTION_PROVIDER_KEY,
  MOTION_TEMPLATE_CAPABILITY,
  MOTION_TEMPLATE_PROVIDER_KEY,
  MOTION_WORKBENCH_CAPABILITY
} from './constants.js'

const templateModuleFilename = fileURLToPath(import.meta.url)
const templateModuleDir = dirname(templateModuleFilename)
const MOTION_TEMPLATE_KEY = 'motion-assistant'
const MOTION_TEMPLATE_FILE = 'xpert-motion-assistant.yaml'
const MOTION_AGENT_KEY = 'Agent_Motion'

function getTemplateCandidates() {
  return [
    join(templateModuleDir, '..', MOTION_TEMPLATE_FILE),
    join(templateModuleDir, MOTION_TEMPLATE_FILE),
    join(process.cwd(), 'apps/motion/src', MOTION_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/motion/src', MOTION_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/motion', MOTION_TEMPLATE_FILE)
  ]
}

function readMotionDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Motion xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const motionTemplates: XpertTemplateContribution[] = [
  {
    key: MOTION_TEMPLATE_KEY,
    name: 'Motion Assistant',
    title: 'Motion Assistant',
    description: 'A data-xpert assistant template for animated HTML, launch videos, recipe routing, motion review, and export workflows.',
    category: 'Motion',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [MOTION_FEATURE, MOTION_WORKBENCH_CAPABILITY, MOTION_AGENT_CAPABILITY, MOTION_LIBRARY_CAPABILITY],
        requiredPlugins: [MOTION_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'motion',
          managedBy: 'data-xpert',
          viewProvider: MOTION_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [MOTION_FEATURE, MOTION_WORKBENCH_CAPABILITY, MOTION_AGENT_CAPABILITY, MOTION_LIBRARY_CAPABILITY],
        requiredPlugins: [MOTION_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [MOTION_PLUGIN_NAME],
      skills: [
        {
          componentKey: 'motion-agent-skill',
          targetAgentKey: MOTION_AGENT_KEY
        }
      ]
    },
    dslContent: readMotionDsl(),
    order: 62,
    default: false,
    startPrompts: [
      'Create an animated landing page for this product brief.',
      'Import this HTML and add tasteful component-level motion.',
      'Make a launch video with kinetic typography and smooth scene transitions.',
      'Use the selected Motion recipe and apply it to the current component.'
    ],
    releaseNotes: 'Created the Motion Agentic App assistant.',
    xpertName: 'Motion Assistant',
    providerKey: MOTION_TEMPLATE_PROVIDER_KEY
  }
]
