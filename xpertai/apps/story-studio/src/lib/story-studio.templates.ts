import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  STORY_STUDIO_AGENT_CAPABILITY,
  STORY_STUDIO_FEATURE,
  STORY_STUDIO_PLUGIN_NAME,
  STORY_STUDIO_PROVIDER_KEY,
  STORY_STUDIO_TEMPLATE_PROVIDER_KEY,
  STORY_STUDIO_WORKBENCH_CAPABILITY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_FILE = 'xpert-story-studio-assistant.yaml'
const TEMPLATE_KEY = 'story-studio-assistant'
const AGENT_KEY = 'Agent_StoryStudio'
const VOLCENGINE_PLUGIN_NAME = '@xpert-ai/plugin-volcengine'
const CUT_PLUGIN_NAME = '@xpert-ai/plugin-cut'
const SEEDREAM_AIGC_PROVIDER = 'seedream_aigc'
const SEEDANCE_TEMPLATE_TOOLSET_NODE_KEY =
  '4f6671c2-0b74-4b3f-8839-5c91379f7382'

type StoryStudioTemplateDependencies = NonNullable<
  XpertTemplateContribution['dependencies']
> & {
  toolsets?: Array<{
    pluginName?: string
    provider: string
    templateNodeKey: string
    targetAgentKey?: string
    instanceName?: string
  }>
}

function templateCandidates() {
  return [
    join(moduleDir, '..', TEMPLATE_FILE),
    join(moduleDir, TEMPLATE_FILE),
    join(process.cwd(), 'apps/story-studio/src', TEMPLATE_FILE),
    join(process.cwd(), 'xpertai/apps/story-studio/src', TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/story-studio', TEMPLATE_FILE)
  ]
}

function readTemplateDsl() {
  const path = templateCandidates().find((candidate) => existsSync(candidate))
  if (!path) {
    throw new Error(
      `Story Studio Assistant DSL was not found: ${templateCandidates().join(', ')}`
    )
  }
  return readFileSync(path, 'utf8')
}

export const storyStudioTemplates = [
  {
    key: TEMPLATE_KEY,
    name: 'Story Studio Assistant',
    title: 'Story Studio 故事工作室',
    description: {
      en_US:
        'A review-first Assistant for scoped story adaptation and production planning.',
      zh_Hans: '面向有作用域故事改编与制作规划的审核优先助手。'
    },
    category: 'Story Production',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [
          STORY_STUDIO_FEATURE,
          STORY_STUDIO_WORKBENCH_CAPABILITY,
          STORY_STUDIO_AGENT_CAPABILITY
        ],
        requiredPlugins: [
          STORY_STUDIO_PLUGIN_NAME,
          VOLCENGINE_PLUGIN_NAME,
          CUT_PLUGIN_NAME
        ],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'story-studio',
          managedBy: 'data-xpert',
          viewProvider: STORY_STUDIO_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [
          STORY_STUDIO_FEATURE,
          STORY_STUDIO_WORKBENCH_CAPABILITY,
          STORY_STUDIO_AGENT_CAPABILITY
        ],
        requiredPlugins: [
          STORY_STUDIO_PLUGIN_NAME,
          VOLCENGINE_PLUGIN_NAME,
          CUT_PLUGIN_NAME
        ]
      }
    },
    dependencies: {
      plugins: [
        STORY_STUDIO_PLUGIN_NAME,
        VOLCENGINE_PLUGIN_NAME,
        CUT_PLUGIN_NAME
      ],
      skills: [
        {
          componentKey: 'story-studio-agent-skill',
          targetAgentKey: AGENT_KEY
        }
      ],
      toolsets: [
        {
          pluginName: VOLCENGINE_PLUGIN_NAME,
          provider: SEEDREAM_AIGC_PROVIDER,
          templateNodeKey: SEEDANCE_TEMPLATE_TOOLSET_NODE_KEY,
          targetAgentKey: AGENT_KEY
        }
      ]
    } satisfies StoryStudioTemplateDependencies,
    dslContent: readTemplateDsl(),
    order: 56,
    default: false,
    startPrompts: [
      'Create a vertical short-drama project from this premise.',
      'Build a three-scene shot plan for the selected project and save it.',
      'Generate synchronized-audio Seedance 2.0 Fast videos for every selected storyboard image and attach them to the matching shots.',
      'Render the selected production plan as a storyboard MP4 and wait for completion.',
      'Prepare the selected shots as StoryCutHandoff v1 and deliver them to Cut.',
      'Search my Story Studio projects and summarize the current production stage.',
      'Review the selected project brief before moving it into planning.',
      'Record why the selected project is blocked and whether the failure is recoverable.'
    ],
    releaseNotes:
      'Added the eight-stage Studio workflow, voice-bound synchronized Seedance audio generation, durable rendering, and version-safe StoryCutHandoff delivery to Cut.',
    xpertName: 'Story Studio Assistant',
    providerKey: STORY_STUDIO_TEMPLATE_PROVIDER_KEY
  }
]
