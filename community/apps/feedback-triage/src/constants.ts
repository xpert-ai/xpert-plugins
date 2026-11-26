import { createRequire } from 'node:module'

export const ARTIFACT_NAMESPACE = 'feedback_triage'
export const packageMetadata = createRequire(import.meta.url)('../package.json') as {
  name: string
  version: string
  xpert: { plugin: { level: 'system'; artifactNamespace: string } }
}
if (packageMetadata.xpert.plugin.artifactNamespace !== ARTIFACT_NAMESPACE) {
  throw new Error('Feedback triage artifact namespace differs from its stored table namespace')
}
export const PLUGIN_NAME = packageMetadata.name
export const VIEW_KEY = `${ARTIFACT_NAMESPACE}.workbench`
export const VIEW_PROVIDER = `${ARTIFACT_NAMESPACE}.views`
export const FEATURE = `${ARTIFACT_NAMESPACE}.review`
export const TEMPLATE_KEY = 'feedback-triage-assistant'
export const TEMPLATE_PROVIDER = `${ARTIFACT_NAMESPACE}.templates`
export const MIDDLEWARE = 'FeedbackTriageMiddleware'
export const LIST_TOOL = 'feedback_inbox'
export const ANALYZE_TOOL = 'feedback_analyze'
export const ICON = { type: 'font', value: 'ri-inbox-archive-line' } as const
export const title = { en_US: 'Feedback triage', zh_Hans: '客户反馈分诊' }
