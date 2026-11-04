import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  FEATURE,
  PLUGIN_NAME,
  TEMPLATE_KEY,
  VIEW_KEY
} from './constants.js'

const TEMPLATE_FILE = 'xpert-resume-match-assistant.yaml'

function readDsl() {
  const candidates = [
    join(__dirname, '..', TEMPLATE_FILE),
    join(__dirname, TEMPLATE_FILE),
    join(process.cwd(), 'apps/resume-match/src', TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/resume-match/src', TEMPLATE_FILE)
  ]
  const file = candidates.find((candidate) => existsSync(candidate))
  if (!file) {
    throw new Error(`找不到简历智能匹配助手模板：${candidates.join(', ')}`)
  }
  return readFileSync(file, 'utf8')
}

export const resumeMatchTemplates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE_KEY,
    name: 'Resume Match Assistant',
    title: '简历智能匹配助理',
    description: '读取岗位说明与简历，输出有证据的匹配分析，等待招聘负责人人工确认。',
    category: '人才招聘',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-assistant'],
        capabilities: [FEATURE, VIEW_KEY],
        requiredPlugins: [PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'resume-match',
          managedBy: 'xpert',
          viewProvider: 'resume_match_views'
        }
      }
    },
    dslContent: readDsl(),
    order: 30,
    default: false,
    startPrompts: [
      '请读取当前待分析的简历记录，完成四维匹配分析并写入工作台。',
      '请说明这条匹配结论的主要依据和需要人工核实的风险。',
      '请重新分析当前记录，并保留上一轮的人工确认状态。'
    ],
    releaseNotes: '创建简历智能匹配业务助手。',
    xpertName: '简历智能匹配助理',
    providerKey: 'resumeMatchTemplates'
  } as XpertTemplateContribution
]
