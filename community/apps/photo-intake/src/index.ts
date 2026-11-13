import 'reflect-metadata'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  FEATURE,
  MIDDLEWARE_NAME,
  PLUGIN_NAME,
  PROVIDER_KEY,
  TEMPLATE_KEY,
  TEMPLATE_PROVIDER,
  VIEW_KEY
} from './lib/constants.js'
import { PACKAGE_METADATA } from './lib/package-metadata.js'
import { PhotoIntakePlugin } from './lib/photo-intake.plugin.js'
import { templates } from './lib/templates.js'

const app = {
  type: 'app',
  name: 'photo-intake',
  displayName: { en_US: 'Photo Intake', zh_Hans: '拍照受理' },
  description: {
    en_US: 'Report an issue with a photo, review the suggested category, confirm and save.',
    zh_Hans: '拍照上报问题，查看建议的类别，确认后保存。'
  },
  icon: { type: 'font', value: 'ri-camera-lens-line' },
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: { en_US: 'Photo Intake', zh_Hans: '拍照受理工作空间' },
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'From a photo to a confirmed category.', zh_Hans: '从一张照片到确认后的类别。' },
      developer: 'Fairchild2333',
      features: [
        {
          key: 'cases',
          title: { en_US: 'Intake cases', zh_Hans: '受理单' },
          description: {
            en_US: 'Every reported issue is saved and can be reopened later.',
            zh_Hans: '每条上报都会保存，之后可以重新打开。'
          }
        },
        {
          key: 'categories',
          title: { en_US: 'Fixed category list', zh_Hans: '固定类别表' },
          description: {
            en_US: 'Suggestions come only from a reviewed list of categories.',
            zh_Hans: '建议只会来自一份经过审阅的类别表。'
          }
        }
      ],
      dataScope: {
        en_US: 'Cases are private to each user and Assistant in the current workspace.',
        zh_Hans: '受理单按当前工作空间中的用户和助手隔离。'
      },
      initializationSummary: {
        en_US: 'Xpert prepares a dedicated workspace and the intake Assistant.',
        zh_Hans: 'Xpert 创建专用工作空间并初始化受理助手。'
      }
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

const configSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: PACKAGE_METADATA.version,
    level: PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    displayName: 'Photo Intake',
    description: 'Photo intake workbench with AI category suggestions and human confirmation.',
    author: 'Fairchild2333',
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [FEATURE],
        marketplace: {
          contents: [
            app,
            {
              type: 'assistant-template',
              name: TEMPLATE_KEY,
              displayName: { en_US: 'Photo Intake Assistant', zh_Hans: '拍照受理助手' },
              description: {
                en_US: 'Suggests a category for a reported issue from a fixed list.',
                zh_Hans: '从固定类别表里为上报的问题建议类别。'
              }
            },
            { type: 'view', name: VIEW_KEY, displayName: 'Photo Intake' }
          ]
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE_NAME],
          viewProviders: [PROVIDER_KEY],
          templateProviders: [TEMPLATE_PROVIDER]
        }
      }
    }
  },
  config: { schema: configSchema },
  templates,
  register() {
    return { module: PhotoIntakePlugin, global: true }
  }
}

export default plugin
export { plugin }
