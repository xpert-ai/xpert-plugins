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
  displayName: { en_US: 'Image Version Acceptance', zh_Hans: '图片分类版本验收' },
  description: {
    en_US: 'Compare two prompts on fixed labelled images, review measured results and save an adoption decision.',
    zh_Hans: '在带标签的固定图片上比较两版提示词，查看实测结果并保存采用决定。'
  },
  icon: { type: 'font', value: 'ri-camera-lens-line' },
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: { en_US: 'Image Version Acceptance', zh_Hans: '图片分类版本验收工作空间' },
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'Evidence for your next prompt release.', zh_Hans: '为下一版提示词提供可回查的验收依据。' },
      developer: 'Fairchild2333',
      features: [
        {
          key: 'cases',
          title: { en_US: 'Fixed evaluation samples', zh_Hans: '固定评测样本' },
          description: {
            en_US: 'Images and reference labels are preserved with each comparison.',
            zh_Hans: '每次验收保留图片引用与参考标签快照。'
          }
        },
        {
          key: 'categories',
          title: { en_US: 'Independent A/B calls', zh_Hans: '独立 A/B 调用' },
          description: {
            en_US: 'Original outputs, failures, retry history and human decisions remain reviewable.',
            zh_Hans: '可查看原始输出、失败、重试历史与人工结论。'
          }
        }
      ],
      dataScope: {
        en_US: 'Samples and evaluations are private to each user and Assistant in the current workspace.',
        zh_Hans: '样本与验收记录按当前工作空间中的用户和助手隔离。'
      },
      initializationSummary: {
        en_US: 'Xpert prepares a dedicated workspace and the evaluation Assistant.',
        zh_Hans: 'Xpert 创建专用工作空间并初始化验收助手。'
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
    displayName: 'Image Version Acceptance',
    description: 'Prompt A/B evaluation with fixed image samples, measured results and human adoption decisions.',
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
              displayName: { en_US: 'Image Evaluation Assistant', zh_Hans: '图片分类验收助手' },
              description: {
                en_US: 'Runs saved A/B image evaluations and reports measured results.',
                zh_Hans: '运行已保存的 A/B 图片验收，报告实测结果。'
              }
            },
            { type: 'view', name: VIEW_KEY, displayName: 'Image Version Acceptance' }
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
