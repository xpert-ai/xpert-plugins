import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CANDIDATE_INTAKE_FEATURE,
  CANDIDATE_INTAKE_PLUGIN_NAME,
  CANDIDATE_INTAKE_VIEW_PROVIDER
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const CANDIDATE_INTAKE_TEMPLATE_KEY = 'candidate-intake-assistant'
export const CANDIDATE_INTAKE_TEMPLATE_PROVIDER = 'candidate_intake.template_provider'

function readCandidateIntakeDsl() {
  const candidates = [
    join(moduleDir, '..', 'candidate-intake-assistant.yaml'),
    join(moduleDir, 'candidate-intake-assistant.yaml'),
    join(process.cwd(), 'community/apps/candidate-intake/src/candidate-intake-assistant.yaml')
  ]
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) throw new Error(`Candidate Intake Assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(templatePath, 'utf8')
}

export const candidateIntakeTemplates: XpertTemplateContribution[] = [
  {
    key: CANDIDATE_INTAKE_TEMPLATE_KEY,
    name: 'Candidate Intake Assistant',
    title: '候选人招聘登记助手',
    description: '候选人邀请、证据化初筛与 HR 人工确认。',
    category: 'Recruiting',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-assistant'],
        capabilities: [CANDIDATE_INTAKE_FEATURE, 'candidate-screening-review'],
        requiredPlugins: [CANDIDATE_INTAKE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'candidate-intake',
          viewProvider: CANDIDATE_INTAKE_VIEW_PROVIDER
        }
      }
    },
    dslContent: readCandidateIntakeDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '请帮我创建一个招聘岗位并生成候选人邀请链接。',
      '请对当前候选人执行证据化初筛并保存结果。',
      '请总结初筛证据和需要 HR 进一步确认的问题。'
    ],
    releaseNotes: '创建候选人招聘登记与初筛助手。',
    xpertName: '候选人招聘登记助手',
    providerKey: CANDIDATE_INTAKE_TEMPLATE_PROVIDER
  } as XpertTemplateContribution
]
