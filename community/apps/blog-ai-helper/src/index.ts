import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { BlogAiHelperPlugin } from './lib/blog-ai-helper.plugin.js'
import {
  BLOG_AI_HELPER_ARTIFACT_NAMESPACE,
  BLOG_AI_HELPER_FEATURE,
  BLOG_AI_HELPER_ICON,
  BLOG_AI_HELPER_MIDDLEWARE_NAME,
  BLOG_AI_HELPER_PROVIDER_KEY,
  BLOG_AI_HELPER_TEMPLATE_PROVIDER_KEY,
  BLOG_AI_HELPER_VIEW_KEY,
  BLOG_AI_HELPER_WORKBENCH_CAPABILITY
} from './lib/constants.js'
import { blogAiHelperTemplates } from './lib/blog-ai-helper.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    artifactNamespace: BLOG_AI_HELPER_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [BLOG_AI_HELPER_FEATURE, BLOG_AI_HELPER_WORKBENCH_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'blog-ai-helper',
              displayName: 'Blog Article AI Helper',
              description:
                'Paste a blog draft, generate AI summary, tags and title suggestions, review and save, and browse history.',
              icon: {
                type: 'svg',
                value: BLOG_AI_HELPER_ICON,
                color: '#0e7490'
              },
              operations: [
                {
                  name: 'process-articles',
                  displayName: 'Process blog articles with AI',
                  description: 'Paste article drafts and generate summaries, tags, and title suggestions.',
                  access: 'write'
                },
                {
                  name: 'review-and-save',
                  displayName: 'Review and save AI results',
                  description: 'Confirm AI-generated article summaries, tags, and titles, then save them to history.',
                  access: 'write'
                },
                {
                  name: 'browse-article-history',
                  displayName: 'Browse article processing history',
                  description: 'Browse saved article processing records and view details.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: BLOG_AI_HELPER_VIEW_KEY,
              displayName: 'Blog Article AI Helper Workbench',
              description: 'Workbench view for pasting blog drafts and reviewing AI-generated summaries, tags, and titles.'
            },
            {
              type: 'tool',
              name: BLOG_AI_HELPER_MIDDLEWARE_NAME,
              displayName: 'Blog Article AI Helper Tools',
              description:
                'Assistant middleware tools for saving AI-generated article summaries, tags, and title suggestions.'
            },
            {
              type: 'assistant-template',
              name: 'blog-ai-helper-assistant',
              displayName: 'Blog Article AI Helper Assistant Template',
              description:
                'Prebuilt assistant workflow template for generating article summaries, tags, and title suggestions from blog drafts.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [BLOG_AI_HELPER_MIDDLEWARE_NAME],
          viewProviders: [BLOG_AI_HELPER_PROVIDER_KEY],
          templateProviders: [BLOG_AI_HELPER_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: BLOG_AI_HELPER_ICON,
      color: '#0e7490'
    },
    displayName: 'Blog Article AI Helper',
    description:
      'Paste a blog draft, generate AI summary, tags and title suggestions with an Xpert, and expose an agent workbench view.',
    keywords: ['blog', 'article', 'summary', 'tags', 'title', 'content-creator', 'middleware', 'view-extension', 'remote-component', 'assistant-template'],
    author: 'Interview Candidate'
  },
  config: {
    schema: ConfigSchema
  },
  templates: blogAiHelperTemplates,
  register(ctx) {
    ctx.logger.log('register blog ai helper plugin')
    return { module: BlogAiHelperPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('blog ai helper plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('blog ai helper plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/blog-ai-helper.plugin.js'
export * from './lib/blog-ai-helper.service.js'
export * from './lib/blog-ai-helper.middleware.js'
export * from './lib/blog-ai-helper-view.provider.js'
export * from './lib/blog-ai-helper.templates.js'
