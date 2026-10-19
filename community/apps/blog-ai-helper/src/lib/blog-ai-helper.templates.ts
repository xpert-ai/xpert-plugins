import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  BLOG_AI_HELPER_FEATURE,
  BLOG_AI_HELPER_PLUGIN_NAME,
  BLOG_AI_HELPER_PROVIDER_KEY,
  BLOG_AI_HELPER_TEMPLATE_PROVIDER_KEY,
  BLOG_AI_HELPER_WORKBENCH_CAPABILITY
} from './constants.js'

const BLOG_AI_HELPER_TEMPLATE_KEY = 'blog-ai-helper-assistant'
const BLOG_AI_HELPER_TEMPLATE_FILE = 'xpert-blog-ai-helper-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', BLOG_AI_HELPER_TEMPLATE_FILE),
    join(runtimeDir, BLOG_AI_HELPER_TEMPLATE_FILE),
    join(process.cwd(), 'apps/blog-ai-helper/src', BLOG_AI_HELPER_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/blog-ai-helper/src', BLOG_AI_HELPER_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/blog-ai-helper', BLOG_AI_HELPER_TEMPLATE_FILE)
  ]
}

function readBlogAiHelperDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Blog AI Helper xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const blogAiHelperTemplates: XpertTemplateContribution[] = [
  {
    key: BLOG_AI_HELPER_TEMPLATE_KEY,
    name: 'Blog Article AI Helper Assistant',
    title: '博客文章AI智能助手',
    description: '粘贴文章草稿，AI 生成摘要、标签和标题建议，审核确认后保存，历史记录可查的 data-xpert 业务助手模板。',
    category: 'Blog & Content',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [BLOG_AI_HELPER_FEATURE, BLOG_AI_HELPER_WORKBENCH_CAPABILITY],
        requiredPlugins: [BLOG_AI_HELPER_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'blog-ai-helper',
          managedBy: 'data-xpert',
          viewProvider: BLOG_AI_HELPER_PROVIDER_KEY
        }
      }
    },
    dslContent: readBlogAiHelperDsl(),
    order: 40,
    default: false,
    startPrompts: [
      '请粘贴一篇博客文章草稿，生成摘要、标签和标题建议。',
      '请为这篇文章草稿重新生成更吸引人的标题。',
      '请分析这篇文章草稿的核心观点，提炼标签并给出发布建议。'
    ],
    releaseNotes: '创建博客文章AI智能助手。',
    xpertName: '博客文章AI智能助手',
    providerKey: BLOG_AI_HELPER_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
