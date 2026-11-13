import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  LISTING_ASSISTANT_FEATURE,
  LISTING_ASSISTANT_PLUGIN_NAME,
  LISTING_ASSISTANT_PROVIDER_KEY,
  LISTING_ASSISTANT_TEMPLATE_FILE,
  LISTING_ASSISTANT_TEMPLATE_KEY,
  LISTING_ASSISTANT_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getTemplateCandidates() {
  return [
    join(__dirname, '..', LISTING_ASSISTANT_TEMPLATE_FILE),
    join(__dirname, LISTING_ASSISTANT_TEMPLATE_FILE),
    join(process.cwd(), 'apps/listing-assistant/src', LISTING_ASSISTANT_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/listing-assistant/src', LISTING_ASSISTANT_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/listing-assistant', LISTING_ASSISTANT_TEMPLATE_FILE)
  ]
}

function readListingDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Listing assistant xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const listingAssistantTemplates: XpertTemplateContribution[] = [
  {
    key: LISTING_ASSISTANT_TEMPLATE_KEY,
    name: 'Bulk Listing Assistant',
    title: '批量上架助手',
    description: '面向商家运营的供货文案解析、结构化上架草稿起草与人工确认助手模板。',
    category: 'Commerce',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [LISTING_ASSISTANT_FEATURE, `${LISTING_ASSISTANT_FEATURE}-workbench`],
        requiredPlugins: [LISTING_ASSISTANT_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'listing-assistant',
          managedBy: 'data-xpert',
          viewProvider: LISTING_ASSISTANT_PROVIDER_KEY
        }
      }
    },
    dslContent: readListingDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '我有一段供货文案，请帮我创建上架任务并解析成标题、描述、价格和规格。',
      '解析当前选中的上架任务，把缺失或不确定的字段标出来。',
      '把核对后的上架信息保存成草稿。'
    ],
    releaseNotes: '创建批量上架业务助手。',
    xpertName: '批量上架助手',
    providerKey: LISTING_ASSISTANT_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
