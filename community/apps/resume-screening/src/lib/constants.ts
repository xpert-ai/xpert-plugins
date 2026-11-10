import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const RESUME_SCREENING_PLUGIN_NAME = '@xpert-ai/plugin-resume-screening'
export const RESUME_SCREENING_PROVIDER_KEY = 'resume_screening'
export const RESUME_SCREENING_VIEW_KEY = 'workbench'
export const RESUME_SCREENING_REMOTE_ENTRY_KEY = 'resume_screening__remote'
export const RESUME_SCREENING_FEATURE = 'resume_screening'
export const RESUME_SCREENING_MIDDLEWARE_NAME = 'ResumeScreeningMiddleware'
export const RESUME_SCREENING_TEMPLATE_PROVIDER_KEY = 'resumeScreeningTemplates'
export const PROJECT_DETAIL_SECTIONS_SLOT = 'detail.sections'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

/** Stable artifact namespace. Declared once here and in package.json `xpert.plugin.artifactNamespace`. */
export const PLUGIN_ARTIFACT_NAMESPACE = 'resume_screening' as const
export const pluginArtifactKey = (localKey: string) => `${PLUGIN_ARTIFACT_NAMESPACE}.${localKey}`

export const RESUME_SCREENING_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'screening')
export const RESUME_CANDIDATE_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'candidate')
export const RESUME_SCORE_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'score')

export const RESUME_SCREENING_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3.5A2.5 2.5 0 0 1 8.5 1h6A2.5 2.5 0 0 1 17 3.5v17l-2.5-1.8L12 20.5l-2.5-1.8L7 20.5v-17Z" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 8h5M9.5 12h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
