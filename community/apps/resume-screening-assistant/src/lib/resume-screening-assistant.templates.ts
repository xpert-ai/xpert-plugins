import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  RESUME_SCREENING_ASSISTANT_FEATURE,
  RESUME_SCREENING_ASSISTANT_PLUGIN_NAME,
  RESUME_SCREENING_ASSISTANT_PROVIDER_KEY,
  RESUME_SCREENING_ASSISTANT_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const TEMPLATE_KEY = 'resume-screening-assistant'
const TEMPLATE_FILE = 'xpert-resume-screening-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getTemplateCandidates() {
  return [
    join(__dirname, '..', TEMPLATE_FILE),
    join(__dirname, TEMPLATE_FILE),
    join(process.cwd(), 'apps/resume-screening-assistant/src', TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/resume-screening-assistant/src', TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/resume-screening-assistant', TEMPLATE_FILE)
  ]
}

function readTemplateDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Resume Screening Assistant DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const resumeScreeningAssistantTemplates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE_KEY,
    name: 'Resume Screening Assistant',
    title: '简历初筛助手',
    description: '面向岗位 JD、批量简历结构化抽取、匹配评分和人工复核的 data-xpert 业务助手模板。',
    category: 'Recruiting',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [RESUME_SCREENING_ASSISTANT_FEATURE, 'resume-screening-workbench'],
        requiredPlugins: [RESUME_SCREENING_ASSISTANT_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'resume-screening',
          managedBy: 'data-xpert',
          viewProvider: RESUME_SCREENING_ASSISTANT_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(),
    order: 45,
    default: false,
    startPrompts: [
      '请帮我创建一个岗位初筛任务，并提示我录入 JD 和筛选标准。',
      '请分析当前岗位下待处理的简历，保存结构化抽取和匹配评分。',
      '请解释候选人排序依据，并列出建议进入面试的候选人。'
    ],
    releaseNotes: '创建简历初筛业务助手。',
    xpertName: '简历初筛助手',
    providerKey: RESUME_SCREENING_ASSISTANT_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
