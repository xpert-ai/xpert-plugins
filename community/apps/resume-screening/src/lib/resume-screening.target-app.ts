import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  RESUME_SCREENING_FEATURE,
  RESUME_SCREENING_ICON,
  RESUME_SCREENING_MIDDLEWARE_NAME,
  RESUME_SCREENING_PROVIDER_KEY,
  RESUME_SCREENING_TEMPLATE_PROVIDER_KEY,
  RESUME_SCREENING_VIEW_KEY
} from './constants.js'

// The marketplace filters by xpert; existing Assistants still use data-xpert.
// Share one contribution definition so both target keys expose identical capabilities.
const metadata: NonNullable<XpertPlugin['meta']['targetAppMeta']>[string] = {
  types: ['workbench-view', 'assistant-tool', 'business-app'],
  capabilities: [
    RESUME_SCREENING_FEATURE,
    'resume-screening-workbench',
    'resume-screening-assistant-template'
  ],
  marketplace: {
    category: 'business-operations',
    subcategory: 'middleware',
    contents: [
      {
        type: 'app',
        name: 'resume-screening',
        displayName: '简历初筛',
        description:
          '根据岗位要求创建筛查单，使用 AI 辅助预筛与评分，并在工作台查看评估依据、完成人工复核。',
        icon: {
          type: 'svg',
          value: RESUME_SCREENING_ICON,
          color: '#0f766e'
        },
        operations: [
          {
            name: 'create-resume-screenings',
            displayName: '创建筛查单',
            description: '根据岗位名称和岗位要求创建筛查单。',
            access: 'write'
          },
          {
            name: 'score-resumes',
            displayName: '简历预筛与评分',
            description: '按照岗位要求预筛简历，并保存 AI 各维度评分及依据。',
            access: 'write'
          },
          {
            name: 'confirm-screening-decisions',
            displayName: '人工复核筛查结果',
            description: '查看候选人评估结果，人工确认面试、待定或淘汰。',
            access: 'read'
          }
        ]
      },
      {
        type: 'view',
        name: RESUME_SCREENING_VIEW_KEY,
        displayName: '简历初筛工作台',
        description: '集中查看候选人、评分依据与人工复核结果。'
      },
      {
        type: 'tool',
        name: RESUME_SCREENING_MIDDLEWARE_NAME,
        displayName: '简历初筛工具',
        description: '供助手读取简历、执行预筛并保存评分，供人工复核。'
      },
      {
        type: 'assistant-template',
        name: 'resume-screening-assistant',
        displayName: '简历初筛助手模板',
        description: '基于岗位要求完成简历预筛、评分与人工复核的预设助手模板。'
      }
    ]
  },
  runtime: {
    middlewareProviders: [RESUME_SCREENING_MIDDLEWARE_NAME],
    viewProviders: [RESUME_SCREENING_PROVIDER_KEY],
    templateProviders: [RESUME_SCREENING_TEMPLATE_PROVIDER_KEY]
  }
}

export const RESUME_SCREENING_TARGET_APPS = ['xpert', 'data-xpert']
export const resumeScreeningTargetAppMeta = { xpert: metadata, 'data-xpert': metadata }
