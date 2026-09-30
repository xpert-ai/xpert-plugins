/**
 * 简历初筛助手模板贡献
 *
 * 以 XpertTemplateContribution 形式向 data-xpert 提供预置助手 DSL：
 * 模块加载时读取并内联 assistant yaml 文本，运行目录多候选回退保证
 * 源码态（jest/tsc 直跑）与构建产物态（dist）都能找到模板文件。
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  RESUME_SCREEN_FEATURE,
  RESUME_SCREEN_PLUGIN_NAME,
  RESUME_SCREEN_PROVIDER_KEY,
  RESUME_SCREEN_TEMPLATE_PROVIDER_KEY
} from './constants'

// 模板键与 yaml 内 options.templateKey 保持一致，平台据此识别模板来源
const RESUME_SCREEN_TEMPLATE_KEY = 'resume-screen-assistant'
const RESUME_SCREEN_TEMPLATE_FILE = 'xpert-resume-screen-assistant.yaml'

// 模板文件候选路径：编译产物目录优先，其次源码目录与常见工作目录，兼容多种启动方式
function getResumeScreenTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', RESUME_SCREEN_TEMPLATE_FILE),
    join(runtimeDir, RESUME_SCREEN_TEMPLATE_FILE),
    join(process.cwd(), 'apps/resume-screen/src', RESUME_SCREEN_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/resume-screen/src', RESUME_SCREEN_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/resume-screen', RESUME_SCREEN_TEMPLATE_FILE)
  ]
}

// 读取 DSL 文本：全部候选路径都缺失时直接抛错，暴露构建/打包遗漏而不是静默产出空模板
function readResumeScreenDsl() {
  const candidates = getResumeScreenTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Resume Screen xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const resumeScreenTemplates: XpertTemplateContribution[] = [
  {
    key: RESUME_SCREEN_TEMPLATE_KEY,
    name: 'Resume Screening Assistant',
    title: '简历初筛助手',
    description: '面向简历批量录入、AI 抽取与岗位匹配评分、人工初筛决策的 data-xpert 业务助手模板。',
    category: 'Resume Screening',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [RESUME_SCREEN_FEATURE, 'resume-review-desk'],
        requiredPlugins: [RESUME_SCREEN_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'resume-screening',
          managedBy: 'data-xpert',
          viewProvider: RESUME_SCREEN_PROVIDER_KEY
        }
      }
    },
    dslContent: readResumeScreenDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '请解析这份简历并按当前岗位给出匹配评分。',
      '请列出当前所有待审核的候选人。',
      '这份简历里有哪些信息是缺失的？'
    ],
    releaseNotes: '创建简历初筛业务助手。',
    xpertName: '简历初筛助手',
    providerKey: RESUME_SCREEN_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
