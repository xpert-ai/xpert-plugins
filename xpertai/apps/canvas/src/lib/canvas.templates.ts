import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CANVAS_AGENT_CAPABILITY,
  CANVAS_FEATURE,
  CANVAS_PLUGIN_NAME,
  CANVAS_PROVIDER_KEY,
  CANVAS_TEMPLATE_CAPABILITY,
  CANVAS_TEMPLATE_PROVIDER_KEY,
  CANVAS_WORKBENCH_CAPABILITY
} from './constants.js'

const templateModuleFilename = fileURLToPath(import.meta.url)
const templateModuleDir = dirname(templateModuleFilename)
const CANVAS_TEMPLATE_KEY = 'canvas-assistant'
const CANVAS_TEMPLATE_FILE = 'xpert-canvas-assistant.yaml'
const CANVAS_AGENT_KEY = 'Agent_Canvas'
const VIEW_IMAGE_PLUGIN_NAME = '@xpert-ai/plugin-view-image'
const canvasSkillDependencies = [
  {
    componentKey: 'canvas-agent-skill',
    targetAgentKey: CANVAS_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(templateModuleDir, '..', CANVAS_TEMPLATE_FILE),
    join(templateModuleDir, CANVAS_TEMPLATE_FILE),
    join(process.cwd(), 'apps/canvas/src', CANVAS_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/canvas/src', CANVAS_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/canvas', CANVAS_TEMPLATE_FILE)
  ]
}

function readCanvasDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Canvas xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const canvasTemplates: XpertTemplateContribution[] = [
  {
    key: CANVAS_TEMPLATE_KEY,
    name: 'Canvas Assistant',
    title: 'Canvas Assistant',
    description: 'A data-xpert visual canvas assistant template for infinite whiteboards, AI image holders, annotation-driven edits, and moodboards.',
    category: 'Canvas',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [CANVAS_FEATURE, CANVAS_WORKBENCH_CAPABILITY, CANVAS_AGENT_CAPABILITY],
        requiredPlugins: [CANVAS_PLUGIN_NAME, VIEW_IMAGE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'canvas',
          managedBy: 'data-xpert',
          viewProvider: CANVAS_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [CANVAS_FEATURE, CANVAS_WORKBENCH_CAPABILITY, CANVAS_AGENT_CAPABILITY],
        requiredPlugins: [CANVAS_PLUGIN_NAME, VIEW_IMAGE_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [CANVAS_PLUGIN_NAME, VIEW_IMAGE_PLUGIN_NAME],
      skills: canvasSkillDependencies
    },
    dslContent: readCanvasDsl(),
    order: 58,
    default: false,
    startPrompts: [
      'Open a new visual canvas for planning this project.',
      'Create AI image slots on a canvas for these product concepts.',
      'Insert this generated image into the selected Canvas image holder.',
      'Use the current Canvas selection and my feedback to update the board.'
    ],
    releaseNotes: 'Created the Canvas Agentic App assistant.',
    xpertName: 'Canvas Assistant',
    providerKey: CANVAS_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
