import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeMatchPlugin } from './lib/plugin.module.js'
import {
  APP_ICON,
  APP_ICON_DEFINITION,
  ARTIFACT_NAMESPACE,
  FEATURE,
  MIDDLEWARE_NAME,
  PACKAGE_METADATA,
  PLUGIN_NAME,
  PROVIDER_KEY,
  TEMPLATE_KEY,
  VIEW_KEY
} from './lib/constants.js'
import { resumeMatchTemplates } from './lib/templates.js'

const plugin: XpertPlugin = {
  meta: {
    name: PLUGIN_NAME,
    version: PACKAGE_METADATA.version,
    level: PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: ARTIFACT_NAMESPACE,
    category: 'middleware',
    icon: APP_ICON_DEFINITION,
    displayName: '简历智能分析与岗位匹配系统',
    description:
      '把岗位说明与简历转化为可解释、可复核、可追溯的匹配结论，并保留人工确认结果。',
    keywords: ['招聘', '简历分析', '岗位匹配', '工作台', '智能助理', '人工确认'],
    author: '谢祥伦',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['workbench-view', 'assistant-tool', 'business-app', 'assistant-template'],
        capabilities: [FEATURE, VIEW_KEY, 'resume-match-human-review'],
        runtime: {
          middlewareProviders: [MIDDLEWARE_NAME],
          viewProviders: [PROVIDER_KEY],
          templateProviders: ['resumeMatchTemplates']
        },
        marketplace: {
          contents: [
            {
              type: 'view',
              name: VIEW_KEY,
              displayName: '简历智能匹配工作台',
              description:
                '输入岗位与简历，查看可解释的匹配结果，完成人工确认并恢复历史记录。'
            },
            {
              type: 'tool',
              name: MIDDLEWARE_NAME,
              displayName: '简历智能匹配工具',
              description:
                '读取分析材料、写入结构化匹配结果、记录可重试的失败原因。'
            },
            {
              type: 'assistant-template',
              name: TEMPLATE_KEY,
              displayName: '简历智能匹配助理',
              description: '读取岗位说明与简历，输出有证据的四维匹配分析。'
            }
          ]
        }
      }
    }
  },
  templates: resumeMatchTemplates,
  register(ctx) {
    ctx.logger.log('register resume-match plugin')
    return { module: ResumeMatchPlugin, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('resume-match plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('resume-match plugin stopped')
  }
}

export default plugin
