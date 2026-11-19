import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SCRAPE_TASK_INTAKE_FEATURE,
  SCRAPE_TASK_INTAKE_PLUGIN_NAME,
  SCRAPE_TASK_INTAKE_PROVIDER_KEY,
  SCRAPE_TASK_INTAKE_TEMPLATE_PROVIDER_KEY
} from './constants'

const SCRAPE_TASK_INTAKE_TEMPLATE_KEY = 'scrape-task-intake-assistant'
const SCRAPE_TASK_INTAKE_TEMPLATE_FILE = 'xpert-scrape-task-intake-assistant.yaml'

function getScrapeTaskIntakeTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', SCRAPE_TASK_INTAKE_TEMPLATE_FILE),
    join(runtimeDir, SCRAPE_TASK_INTAKE_TEMPLATE_FILE),
    join(process.cwd(), 'apps/scrape-task-intake/src', SCRAPE_TASK_INTAKE_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/scrape-task-intake/src', SCRAPE_TASK_INTAKE_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/scrape-task-intake', SCRAPE_TASK_INTAKE_TEMPLATE_FILE)
  ]
}

function readScrapeTaskIntakeDsl() {
  const candidates = getScrapeTaskIntakeTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Scrape task intake xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const scrapeTaskIntakeTemplates: XpertTemplateContribution[] = [
  {
    key: SCRAPE_TASK_INTAKE_TEMPLATE_KEY,
    name: 'Scrape Task Intake Assistant',
    title: '采集需求受理助手',
    description: '面向自然语言采集需求受理、任务书生成、审核补充与状态跟踪的 data-xpert 业务助手模板。',
    category: 'Scrape Task Intake',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SCRAPE_TASK_INTAKE_FEATURE, 'scrape-task-review-desk'],
        requiredPlugins: [SCRAPE_TASK_INTAKE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'scrape-task-intake',
          managedBy: 'data-xpert',
          viewProvider: SCRAPE_TASK_INTAKE_PROVIDER_KEY
        }
      }
    },
    dslContent: readScrapeTaskIntakeDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '请根据这段采集需求生成一张待人工确认的采集任务书。',
      '请读取站点类型字段模板,帮我规范采集字段、频率和交付格式。',
      '请查询需要补充的采集任务,并根据补充内容生成补充草稿。'
    ],
    releaseNotes: '创建采集需求受理业务助手。',
    xpertName: '采集需求受理助手',
    providerKey: SCRAPE_TASK_INTAKE_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
