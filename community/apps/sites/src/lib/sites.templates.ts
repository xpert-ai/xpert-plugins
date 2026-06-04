import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SITES_FEATURE,
  SITES_PLUGIN_NAME,
  SITES_PROVIDER_KEY,
  SITES_TEMPLATE_PROVIDER_KEY,
  SITES_VIEW_KEY
} from './constants.js'

const SITES_TEMPLATE_KEY = 'sites-builder-assistant'
const SITES_TEMPLATE_FILE = 'xpert-sites-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getSitesTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', SITES_TEMPLATE_FILE),
    join(runtimeDir, SITES_TEMPLATE_FILE),
    join(process.cwd(), 'apps/sites/src', SITES_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/sites/src', SITES_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/sites', SITES_TEMPLATE_FILE)
  ]
}

function readSitesDsl() {
  const candidates = getSitesTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Sites xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const sitesTemplates: XpertTemplateContribution[] = [
  {
    key: SITES_TEMPLATE_KEY,
    name: 'Sites Builder Assistant',
    title: 'Sites 站点构建助手',
    description: '面向站点创建、候选版本保存、生产发布、访问控制和环境值管理的 data-xpert 助手模板。',
    category: 'Sites',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SITES_FEATURE, SITES_VIEW_KEY],
        requiredPlugins: [SITES_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'sites',
          managedBy: 'data-xpert',
          viewProvider: SITES_PROVIDER_KEY
        }
      }
    },
    dslContent: readSitesDsl(),
    order: 30,
    default: false,
    startPrompts: [
      '请创建一个项目请求看板站点，先保存版本，再发布给管理员查看。',
      '请把这个站点改成需要保存用户进度的版本，并使用 D1 存储形态。',
      '请列出最近发布的 Sites 项目并检查生产 URL。'
    ],
    releaseNotes: '创建 Sites 站点构建助手。',
    xpertName: 'Sites 站点构建助手',
    providerKey: SITES_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
