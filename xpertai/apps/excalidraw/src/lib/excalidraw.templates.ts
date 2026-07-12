import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum, type I18nObject } from '@xpert-ai/contracts'
import {
  EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
  EXCALIDRAW_ARTIFACT_TEMPLATE_CAPABILITY,
  EXCALIDRAW_DIAGRAM_IR_CAPABILITY,
  EXCALIDRAW_DIAGRAM_QUALITY_CAPABILITY,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_PLUGIN_NAME,
  EXCALIDRAW_PROVIDER_KEY,
  EXCALIDRAW_TEMPLATE_CAPABILITY,
  EXCALIDRAW_TEMPLATE_PROVIDER_KEY,
  EXCALIDRAW_WORKBENCH_CAPABILITY
} from './constants.js'

const templateModuleFilename = fileURLToPath(import.meta.url)
const templateModuleDir = dirname(templateModuleFilename)
const EXCALIDRAW_TEMPLATE_KEY = 'excalidraw-assistant'
const EXCALIDRAW_TEMPLATE_FILE = 'xpert-excalidraw-assistant.yaml'
const TECHNICAL_DIAGRAM_TEMPLATE_KEY = 'excalidraw-technical-diagram-assistant'
const TECHNICAL_DIAGRAM_TEMPLATE_FILE = 'xpert-excalidraw-technical-diagram-assistant.yaml'
const EXCALIDRAW_AGENT_KEY = 'Agent_Excalidraw'
const TECHNICAL_DIAGRAM_AGENT_KEY = 'Agent_Excalidraw_Technical_Diagram'
const WEB_TOOLS_PLUGIN_NAME = '@xpert-ai/plugin-web-tools'
const EXCALIDRAW_AGENT_SKILL_KEY = 'excalidraw-agent-skill'
const excalidrawSkillDependencies = [
  {
    componentKey: EXCALIDRAW_AGENT_SKILL_KEY,
    targetAgentKey: EXCALIDRAW_AGENT_KEY
  }
]

function getTemplateCandidates() {
  return [
    join(templateModuleDir, '..', EXCALIDRAW_TEMPLATE_FILE),
    join(templateModuleDir, EXCALIDRAW_TEMPLATE_FILE),
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

function readTechnicalDiagramDsl() {
  const candidates = [
    join(templateModuleDir, '..', TECHNICAL_DIAGRAM_TEMPLATE_FILE),
    join(templateModuleDir, TECHNICAL_DIAGRAM_TEMPLATE_FILE),
    join(process.cwd(), 'apps/excalidraw/src', TECHNICAL_DIAGRAM_TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/excalidraw/src', TECHNICAL_DIAGRAM_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/excalidraw', TECHNICAL_DIAGRAM_TEMPLATE_FILE)
  ]
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) throw new Error(`Technical diagram xpert DSL template file not found: ${candidates.join(', ')}`)
  return readFileSync(templatePath, 'utf8')
}

export const excalidrawTemplates = [
  {
    key: EXCALIDRAW_TEMPLATE_KEY,
    name: 'Excalidraw Drawing Assistant',
    title: 'Excalidraw Drawing Assistant',
    description: {
      en_US:
        'A data-xpert drawing assistant template for flowcharts, architecture diagrams, wireframes, and freeform whiteboards.',
      zh_Hans: '面向流程图、架构图、线框图和自由白板的 data-xpert 绘图助手模板。'
    },
    category: 'Excalidraw',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [EXCALIDRAW_FEATURE, EXCALIDRAW_WORKBENCH_CAPABILITY, EXCALIDRAW_AGENT_DRAWING_CAPABILITY],
        requiredPlugins: [EXCALIDRAW_PLUGIN_NAME, WEB_TOOLS_PLUGIN_NAME],
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
        requiredPlugins: [EXCALIDRAW_PLUGIN_NAME, WEB_TOOLS_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [EXCALIDRAW_PLUGIN_NAME, WEB_TOOLS_PLUGIN_NAME],
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
  },
  {
    key: TECHNICAL_DIAGRAM_TEMPLATE_KEY,
    name: 'Excalidraw Technical Diagram Assistant',
    title: 'Excalidraw Technical Diagram Assistant',
    description: {
      en_US: 'A template-driven DiagramIR assistant with deterministic layout, validation, Excalidraw rendering, and bounded visual review.',
      zh_Hans: '采用模板、DiagramIR、确定性布局、校验、Excalidraw 渲染和有界视觉审核的技术图助手。'
    },
    category: 'Excalidraw',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [EXCALIDRAW_FEATURE, EXCALIDRAW_WORKBENCH_CAPABILITY, EXCALIDRAW_AGENT_DRAWING_CAPABILITY, EXCALIDRAW_ARTIFACT_TEMPLATE_CAPABILITY, EXCALIDRAW_DIAGRAM_IR_CAPABILITY, EXCALIDRAW_DIAGRAM_QUALITY_CAPABILITY],
        requiredPlugins: [EXCALIDRAW_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant', businessDomain: 'excalidraw-technical-diagram', managedBy: 'data-xpert', viewProvider: EXCALIDRAW_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [EXCALIDRAW_FEATURE, EXCALIDRAW_WORKBENCH_CAPABILITY, EXCALIDRAW_AGENT_DRAWING_CAPABILITY, EXCALIDRAW_ARTIFACT_TEMPLATE_CAPABILITY, EXCALIDRAW_DIAGRAM_IR_CAPABILITY, EXCALIDRAW_DIAGRAM_QUALITY_CAPABILITY],
        requiredPlugins: [EXCALIDRAW_PLUGIN_NAME]
      }
    },
    dependencies: {
      plugins: [EXCALIDRAW_PLUGIN_NAME],
      skills: [
        { componentKey: EXCALIDRAW_AGENT_SKILL_KEY, targetAgentKey: TECHNICAL_DIAGRAM_AGENT_KEY },
        { componentKey: 'technical-diagram', targetAgentKey: TECHNICAL_DIAGRAM_AGENT_KEY }
      ]
    },
    dslContent: readTechnicalDiagramDsl(),
    order: 61,
    default: false,
    startPrompts: [
      'Create a RAG architecture from a built-in DiagramIR template and visually review it.',
      'Create a layered microservices architecture using semantic nodes and deterministic routing.',
      'Validate and improve the current technical diagram without overwriting manual edits.'
    ],
    releaseNotes: 'Added the template-driven DiagramIR technical diagram assistant.',
    xpertName: 'Excalidraw Technical Diagram Assistant',
    providerKey: EXCALIDRAW_TEMPLATE_PROVIDER_KEY
  }
]
