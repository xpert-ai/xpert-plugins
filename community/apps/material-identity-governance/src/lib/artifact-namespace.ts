export const PLUGIN_NAME = '@xpert-ai/plugin-material-identity-governance'
export const PLUGIN_VERSION = '0.1.0'
export const ARTIFACT_NAMESPACE = 'material_identity'
export const artifactKey = (key: string) => `${ARTIFACT_NAMESPACE}_${key}`
export const VIEW_KEYS = {
  dashboard: artifactKey('operations_dashboard'),
  workspace: artifactKey('case_workspace'),
} as const

export { APP_ICON } from './branding.js'
