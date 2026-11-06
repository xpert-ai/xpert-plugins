import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  RESUME_SCREENING_ASSISTANT_FEATURE,
  RESUME_SCREENING_ASSISTANT_ICON,
  RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME,
  RESUME_SCREENING_ASSISTANT_PROVIDER_KEY,
  RESUME_SCREENING_ASSISTANT_TEMPLATE_PROVIDER_KEY,
  RESUME_SCREENING_ASSISTANT_VIEW_KEY
} from './lib/constants.js'
import { ResumeScreeningAssistantPlugin } from './lib/resume-screening-assistant.plugin.js'
import { resumeScreeningAssistantTemplates } from './lib/resume-screening-assistant.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          RESUME_SCREENING_ASSISTANT_FEATURE,
          'resume-screening-workbench',
          'resume-structured-extraction',
          'resume-jd-match-scoring',
          'resume-screening-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'resume-screening-assistant',
              displayName: 'Resume Screening Assistant',
              description:
                'Create hiring jobs, import resumes, run AI extraction and JD matching, then review and save screening decisions.',
              icon: {
                type: 'svg',
                value: RESUME_SCREENING_ASSISTANT_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-screening-jobs',
                  displayName: 'Create screening jobs',
                  description: 'Create job records with JD and screening criteria.',
                  access: 'write'
                },
                {
                  name: 'analyze-resumes',
                  displayName: 'Analyze resumes',
                  description: 'Use assistant tools to save structured resume extraction and match scoring results.',
                  access: 'write'
                },
                {
                  name: 'review-screening-results',
                  displayName: 'Review screening results',
                  description: 'Review sorted candidates, adjust scores, and save recruiter decisions.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: RESUME_SCREENING_ASSISTANT_VIEW_KEY,
              displayName: 'Resume Screening Workbench',
              description: 'Workbench view for jobs, candidates, AI scores, review decisions, and retryable failures.'
            },
            {
              type: 'tool',
              name: RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME,
              displayName: 'Resume Screening Tools',
              description:
                'Assistant middleware tools for saving resume extraction, match scoring, recruiter decisions, and parse failures.'
            },
            {
              type: 'assistant-template',
              name: 'resume-screening-assistant',
              displayName: 'Resume Screening Assistant Template',
              description:
                'Prebuilt assistant workflow template for resume extraction, JD matching, screening recommendations, and recruiter review.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME],
          viewProviders: [RESUME_SCREENING_ASSISTANT_PROVIDER_KEY],
          templateProviders: [RESUME_SCREENING_ASSISTANT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: RESUME_SCREENING_ASSISTANT_ICON,
      color: '#2563eb'
    },
    displayName: 'Resume Screening Assistant',
    description:
      'Create hiring jobs, parse resumes with an Xpert, score candidates against JD criteria, and expose a recruiter workbench view.',
    keywords: ['resume', 'screening', 'recruiting', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Community'
  },
  config: {
    schema: ConfigSchema
  },
  templates: resumeScreeningAssistantTemplates,
  register(ctx) {
    ctx.logger.log('register resume screening assistant plugin')
    return { module: ResumeScreeningAssistantPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('resume screening assistant plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('resume screening assistant plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/resume-screening-assistant.plugin.js'
export * from './lib/resume-screening-assistant.service.js'
export * from './lib/resume-screening-assistant.middleware.js'
export * from './lib/resume-screening-assistant-view.provider.js'
export * from './lib/resume-screening-assistant.templates.js'
