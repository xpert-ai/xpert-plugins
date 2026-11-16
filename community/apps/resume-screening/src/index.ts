import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeScreeningPlugin } from './lib/resume-screening.plugin.js'
import {
  PLUGIN_ARTIFACT_NAMESPACE,
  RESUME_SCREENING_ICON
} from './lib/constants.js'
import { resumeScreeningTemplates } from './lib/resume-screening.templates.js'
import { RESUME_SCREENING_TARGET_APPS, resumeScreeningTargetAppMeta } from './lib/resume-screening.target-app.js'

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
    targetApps: RESUME_SCREENING_TARGET_APPS,
    targetAppMeta: resumeScreeningTargetAppMeta,
    category: 'middleware',
    icon: {
      type: 'svg',
      value: RESUME_SCREENING_ICON,
      color: '#0f766e'
    },
    displayName: '简历初筛',
    description:
      '根据岗位要求管理简历，由 AI 辅助预筛与评分，在工作台查看依据并完成人工复核。',
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
