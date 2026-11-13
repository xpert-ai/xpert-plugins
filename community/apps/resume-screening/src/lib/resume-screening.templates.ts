import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  RESUME_SCREENING_FEATURE,
  RESUME_SCREENING_PLUGIN_NAME,
  RESUME_SCREENING_PROVIDER_KEY,
  RESUME_SCREENING_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const RESUME_TEMPLATE_KEY = 'resume-screening-assistant'
const RESUME_TEMPLATE_FILE = 'xpert-resume-screening-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getResumeTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', RESUME_TEMPLATE_FILE),
    join(runtimeDir, RESUME_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/resume-screening/src', RESUME_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/resume-screening', RESUME_TEMPLATE_FILE)
  ]
}

function readResumeDsl() {
  const candidates = getResumeTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Resume Screening xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const resumeScreeningTemplates: XpertTemplateContribution[] = [
  {
    key: RESUME_TEMPLATE_KEY,
    name: 'Resume Screening Assistant',
    title: '简历初筛助手',
    description: '面向 JD 的简历初筛业务助手模板：硬条件预筛、五维打分、工作台人工确认。',
    category: 'Recruitment',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [RESUME_SCREENING_FEATURE, 'resume-screening-workbench'],
        requiredPlugins: [RESUME_SCREENING_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'resume-screening',
          managedBy: 'data-xpert',
          viewProvider: RESUME_SCREENING_PROVIDER_KEY
        }
      }
    },
    dslContent: readResumeDsl(),
    order: 40,
    default: false,
    startPrompts: [
      '请帮我创建一个 Java 高级开发的简历筛查单，并告诉我需要提供哪些 JD 信息。',
      '请对当前筛查单里的候选人做硬条件预筛，并列出每条规则的证据。',
      '请按五维打分给候选人排序，并说明每个分数的理由。'
    ],
    releaseNotes: '创建简历初筛业务助手。',
    xpertName: '简历初筛助手',
    providerKey: RESUME_SCREENING_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
