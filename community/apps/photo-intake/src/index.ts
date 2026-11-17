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
    en_US: 'Take in facility issue photos: the Assistant suggests a category, a person confirms it, and prompt changes are accepted on confirmed cases before they take effect.',
    zh_Hans: '受理设施问题照片：助手给出类别建议，由人确认；提示词改动先在已确认的受理单上验收，采用后才生效。'
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
      tagline: { en_US: 'A photo in, a confirmed category out.', zh_Hans: '拍一张照片，得到一个有人确认过的类别。' },
      developer: 'Fairchild2333',
      features: [
        {
          key: 'cases',
          title: { en_US: 'Suggested, then confirmed', zh_Hans: '先建议，后确认' },
          description: {
            en_US: 'The Assistant classifies the photo and gives a reason; a person accepts or corrects the category.',
            zh_Hans: '助手识别照片并说明理由，由人接受或改正类别。'
          }
        },
        {
          key: 'categories',
          title: { en_US: 'Prompt acceptance', zh_Hans: '提示词验收' },
          description: {
            en_US: 'A new prompt is compared with the current one on confirmed cases; the adopted version is used for intake.',
            zh_Hans: '新提示词与当前提示词在已确认的受理单上对比，被采用的版本用于之后的受理。'
          }
        }
      ],
      dataScope: {
        en_US: 'Cases, photos and acceptance runs are private to each user and Assistant in the current workspace.',
        zh_Hans: '受理单、照片与验收记录按当前工作空间中的用户和助手隔离。'
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
    description: 'Photo intake with AI category suggestions, human confirmation, and prompt acceptance on confirmed cases.',
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
                en_US: 'Recognises case photos into category suggestions and runs saved prompt acceptance.',
                zh_Hans: '识别受理单照片并给出类别建议，运行已保存的提示词验收。'
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
