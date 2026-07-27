import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { STORY_STUDIO_PACKAGE_METADATA } from './package-metadata.js'
import {
  STORY_STUDIO_AGENT_CAPABILITY,
  STORY_STUDIO_ARTIFACT_NAMESPACE,
  STORY_STUDIO_FEATURE,
  STORY_STUDIO_ICON,
  STORY_STUDIO_MIDDLEWARE_NAME,
  STORY_STUDIO_PLUGIN_NAME,
  STORY_STUDIO_PROVIDER_KEY,
  STORY_STUDIO_TEMPLATE_CAPABILITY,
  STORY_STUDIO_TEMPLATE_PROVIDER_KEY,
  STORY_STUDIO_WORKBENCH_CAPABILITY,
  STORY_STUDIO_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { StoryStudioPlugin } from './lib/story-studio.plugin.js'
import { storyStudioTemplates } from './lib/story-studio.templates.js'

const ConfigSchema = z.object({}).strict()
const text = (en_US: string, zh_Hans: string): I18nObject => ({
  en_US,
  zh_Hans
})

type StoryStudioXpertPlugin = Omit<
  XpertPlugin<z.infer<typeof ConfigSchema>>,
  'templates'
> & {
  templates: typeof storyStudioTemplates
}

const capabilities = [
  STORY_STUDIO_FEATURE,
  STORY_STUDIO_WORKBENCH_CAPABILITY,
  STORY_STUDIO_AGENT_CAPABILITY,
  STORY_STUDIO_TEMPLATE_CAPABILITY
]

const operations = [
  {
    name: 'create-story-projects',
    displayName: 'Create story projects',
    description: text(
      'Create scoped, revision-safe story-production projects.',
      '创建带作用域和版本保护的故事制作项目。'
    ),
    access: 'write' as const
  },
  {
    name: 'review-story-projects',
    displayName: 'Review story projects',
    description: text(
      'Inspect project status, format, revision, and next production stage.',
      '检查项目状态、格式、版本和下一制作阶段。'
    ),
    access: 'read' as const
  },
  {
    name: 'advance-story-workflows',
    displayName: 'Advance story workflows',
    description: text(
      'Apply explicit, reviewable project metadata and status changes.',
      '应用明确、可审核的项目元数据和状态变更。'
    ),
    access: 'write' as const
  },
  {
    name: 'render-storyboard-video',
    displayName: 'Render storyboard video',
    description: text(
      'Queue a durable storyboard MP4 from the reviewed scene and shot plan.',
      '根据已审核的场景与镜头计划异步渲染分镜 MP4。'
    ),
    access: 'write' as const
  },
  {
    name: 'attach-seedance-video',
    displayName: 'Attach Seedance video',
    description: text(
      'Attach one completed, scoped Seedance Workspace MP4 to an exact production shot.',
      '将已完成且作用域匹配的 Seedance Workspace MP4 绑定到指定制作镜头。'
    ),
    access: 'write' as const
  },
  {
    name: 'prepare-cut-handoff',
    displayName: 'Prepare Cut handoff',
    description: text(
      'Freeze selected Workspace MP4s into StoryCutHandoff v1 and deliver a new Cut project or review proposal.',
      '将已选 Workspace MP4 冻结为 StoryCutHandoff v1，并交付新的 Cut 项目或审核提案。'
    ),
    access: 'write' as const
  }
]

const plugin: StoryStudioXpertPlugin = {
  meta: {
    name: STORY_STUDIO_PACKAGE_METADATA.name,
    version: STORY_STUDIO_PACKAGE_METADATA.version,
    artifactNamespace: STORY_STUDIO_ARTIFACT_NAMESPACE,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities,
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'story-studio',
              displayName: 'Story Studio',
              description: text(
                'Plan and review story adaptation and media-production stages.',
                '规划和审核故事改编与媒体制作阶段。'
              ),
              icon: {
                type: 'svg',
                value: STORY_STUDIO_ICON,
                color: '#7c3aed'
              },
              operations
            },
            {
              type: 'view',
              name: STORY_STUDIO_WORKBENCH_VIEW_KEY,
              displayName: 'Story Studio Workbench',
              description: text(
                'Project and production-stage review Workbench.',
                '项目与制作阶段审核工作台。'
              ),
              metadata: { app: 'story-studio' }
            },
            {
              type: 'middleware',
              name: STORY_STUDIO_MIDDLEWARE_NAME,
              displayName: 'Story Studio Agent Tools',
              description: text(
                'Strict project lifecycle tools with scope, pagination, revision checks, and failure reporting.',
                '提供作用域、分页、版本检查和失败上报的严格项目生命周期工具。'
              ),
              metadata: { app: 'story-studio' }
            },
            {
              type: 'assistant-template',
              name: 'story-studio-assistant',
              displayName: 'Story Studio Assistant',
              description: text(
                'Prebuilt Assistant for reviewable story-production workflows.',
                '面向可审核故事制作工作流的预置助手。'
              ),
              metadata: { app: 'story-studio' }
            }
          ]
        },
        runtime: {
          middlewareProviders: [STORY_STUDIO_MIDDLEWARE_NAME],
          viewProviders: [STORY_STUDIO_PROVIDER_KEY],
          templateProviders: [STORY_STUDIO_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities,
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'story-studio-agent-skill',
              displayName: 'Story Studio Agent Skill',
              description: text(
                'Use revision-safe Story Studio tools for scoped story-production projects.',
                '使用支持版本保护的 Story Studio 工具管理有作用域的故事制作项目。'
              ),
              tags: ['skill', 'story', 'script', 'storyboard', 'production']
            },
            {
              type: 'assistant-template',
              name: 'story-studio-assistant',
              displayName: 'Story Studio Assistant',
              description: text(
                'Assistant template for reviewable story adaptation workflows.',
                '面向可审核故事改编工作流的助手模板。'
              ),
              metadata: { app: 'story-studio' }
            },
            {
              type: 'app',
              name: 'story-studio',
              displayName: 'Story Studio',
              description: text(
                'Plan and review story adaptation and media-production stages.',
                '规划和审核故事改编与媒体制作阶段。'
              ),
              operations
            },
            {
              type: 'view',
              name: STORY_STUDIO_WORKBENCH_VIEW_KEY,
              displayName: 'Story Studio Workbench',
              description: text(
                'Project and production-stage review Workbench.',
                '项目与制作阶段审核工作台。'
              ),
              metadata: { app: 'story-studio' }
            },
            {
              type: 'middleware',
              name: STORY_STUDIO_MIDDLEWARE_NAME,
              displayName: 'Story Studio Agent Tools',
              description: text(
                'Strict project lifecycle tools with scope, pagination, revision checks, and failure reporting.',
                '提供作用域、分页、版本检查和失败上报的严格项目生命周期工具。'
              ),
              metadata: { app: 'story-studio' }
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: STORY_STUDIO_ICON,
      color: '#7c3aed'
    },
    displayName: 'Story Studio',
    description:
      'Agentic story-to-video studio with eight reviewable stages, Seedance media generation, and versioned Cut handoff.',
    keywords: [
      'story-studio',
      'adaptation',
      'script',
      'storyboard',
      'video-production',
      'agentic-app'
    ],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: storyStudioTemplates,
  register(ctx) {
    ctx.logger.log('register Story Studio plugin')
    return {
      module: StoryStudioPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('Story Studio plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Story Studio plugin stopped')
  }
}

export default plugin
export { STORY_STUDIO_PLUGIN_NAME }
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/production-types.js'
export * from './lib/entities/index.js'
export * from './lib/story-studio.plugin.js'
export * from './lib/story-studio.service.js'
export * from './lib/story-production.service.js'
export * from './lib/story-generated-media.service.js'
export * from './lib/story-render.processor.js'
export * from './lib/story-studio.middleware.js'
export * from './lib/story-studio-view.provider.js'
export * from './lib/story-studio.templates.js'
