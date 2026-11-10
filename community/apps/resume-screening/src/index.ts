import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeScreeningPlugin } from './lib/resume-screening.plugin.js'
import {
  PLUGIN_ARTIFACT_NAMESPACE,
  RESUME_SCREENING_FEATURE,
  RESUME_SCREENING_ICON,
  RESUME_SCREENING_MIDDLEWARE_NAME,
  RESUME_SCREENING_PROVIDER_KEY,
  RESUME_SCREENING_TEMPLATE_PROVIDER_KEY,
  RESUME_SCREENING_VIEW_KEY
} from './lib/constants.js'
import { resumeScreeningTemplates } from './lib/resume-screening.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

// Runtime metadata is derived from package.json so the declared version, level
// and artifact namespace cannot drift from the published package metadata.
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
  xpert: { plugin: { level: 'system'; artifactNamespace: string } }
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          RESUME_SCREENING_FEATURE,
          'resume-screening-workbench',
          'resume-screening-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'resume-screening',
              displayName: 'Resume Screening',
              description:
                'Create a screening case from a job description, score candidates with AI, and confirm interview decisions in a workbench.',
              icon: {
                type: 'svg',
                value: RESUME_SCREENING_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'create-resume-screenings',
                  displayName: 'Create resume screenings',
                  description: 'Create a screening case from a job title and JD text.',
                  access: 'write'
                },
                {
                  name: 'score-resumes',
                  displayName: 'Score resumes',
                  description: 'Prescreen resumes against the JD and save AI dimension scores.',
                  access: 'write'
                },
                {
                  name: 'confirm-screening-decisions',
                  displayName: 'Confirm screening decisions',
                  description: 'Review ranked candidates and confirm interview, pending, or rejected.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: RESUME_SCREENING_VIEW_KEY,
              displayName: 'Resume Screening Workbench',
              description: 'Workbench view for ranked candidates, scores, and human confirmations.'
            },
            {
              type: 'tool',
              name: RESUME_SCREENING_MIDDLEWARE_NAME,
              displayName: 'Resume Screening Tools',
              description: 'Assistant middleware tools for prescreening, scoring, and confirming resumes.'
            },
            {
              type: 'assistant-template',
              name: 'resume-screening-assistant',
              displayName: 'Resume Screening Assistant Template',
              description: 'Prebuilt assistant workflow template for JD-based resume screening and review.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [RESUME_SCREENING_MIDDLEWARE_NAME],
          viewProviders: [RESUME_SCREENING_PROVIDER_KEY],
          templateProviders: [RESUME_SCREENING_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: RESUME_SCREENING_ICON,
      color: '#0f766e'
    },
    displayName: 'Resume Screening',
    description:
      'Screen resumes against a job description with an Xpert assistant, and expose a workbench view for human confirmation.',
    keywords: ['resume-screening', 'recruitment', 'middleware', 'view-extension', 'remote-component', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: resumeScreeningTemplates,
  register(ctx) {
    ctx.logger.log('register resume screening plugin')
    return { module: ResumeScreeningPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('resume screening plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('resume screening plugin stopped')
  }
}

export default plugin
export { PLUGIN_ARTIFACT_NAMESPACE }
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/resume-screening.plugin.js'
export * from './lib/resume-screening.service.js'
export * from './lib/resume-screening.middleware.js'
export * from './lib/resume-screening-view.provider.js'
export * from './lib/resume-screening.templates.js'
