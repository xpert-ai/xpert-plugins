/**
 * 简历筛选插件入口：声明插件 meta（应用归属、能力、市场内容）、
 * 配置模式与环境变量默认值，并注册 NestJS 插件模块。
 * 当前 runtime 提供者为空占位，随后续阶段补齐服务与工具。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  ResumeScreenPluginConfigFormSchema,
  ResumeScreenPluginConfigSchema,
  readResumeScreenPluginEnvDefaults
} from './lib/resume-screen.config'
import { ResumeScreenPlugin } from './lib/resume-screen.plugin'
import { resumeScreenTemplates } from './lib/resume-screen.templates'
import {
  RESUME_SCREEN_FEATURE,
  RESUME_SCREEN_ICON,
  RESUME_SCREEN_PROVIDER_KEY,
  RESUME_SCREEN_TEMPLATE_PROVIDER_KEY
} from './lib/constants'

// 运行期以编译产物为基准读取包信息，meta 的 name/version 与 package.json 保持单一来源
const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = ResumeScreenPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          RESUME_SCREEN_FEATURE,
          'resume-intake',
          'resume-review-desk',
          'resume-screen-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'resume-screen',
              displayName: 'Resume Screening',
              description:
                'Paste a job description and resumes, let AI extract and score candidates, then accept, hold or reject each one manually.',
              icon: {
                type: 'svg',
                value: RESUME_SCREEN_ICON,
                color: '#1d4ed8'
              },
              operations: [
                {
                  name: 'create-jobs',
                  displayName: 'Create job descriptions',
                  description: 'Create and switch job descriptions used for resume scoring.',
                  access: 'write'
                },
                {
                  name: 'screen-resumes',
                  displayName: 'Screen resumes with AI',
                  description: 'Paste resume texts and let the assistant extract fields and score matches for review.',
                  access: 'write'
                },
                {
                  name: 'review-candidates',
                  displayName: 'Review candidates',
                  description: 'Accept, hold or reject candidates and correct AI-extracted fields.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: 'workbench',
              displayName: 'Resume Screening Workbench',
              description: 'Workbench view for job switching, candidate list, detail review and batch resume intake.'
            },
            {
              type: 'tool',
              name: 'ResumeScreenMiddleware',
              displayName: 'Resume Screening Tools',
              description:
                'Assistant middleware tools for saving AI-extracted candidates and querying candidate lists and details.'
            },
            {
              type: 'assistant-template',
              name: 'resume-screen-assistant',
              displayName: 'Resume Screening Assistant Template',
              description:
                'Prebuilt assistant workflow template for resume intake, AI extraction and scoring, and human review support.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [],
          viewProviders: [RESUME_SCREEN_PROVIDER_KEY],
          templateProviders: [RESUME_SCREEN_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: RESUME_SCREEN_ICON,
      color: '#1d4ed8'
    },
    displayName: 'Resume Screening',
    description: 'Screen resumes against a job description with AI extraction and scoring, then review manually.',
    keywords: ['resume', 'screening', 'hiring', 'view-extension', 'remote-component', 'agent-tool', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: ResumeScreenPluginConfigFormSchema,
    defaults: readResumeScreenPluginEnvDefaults()
  },
  // 预置助手模板：data-xpert 据此在模板市场展示并一键创建简历初筛助手
  templates: resumeScreenTemplates,
  register(ctx) {
    ctx.logger.log('register resume-screen plugin')
    return { module: ResumeScreenPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('resume-screen plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('resume-screen plugin stopped')
  }
}

export default plugin
