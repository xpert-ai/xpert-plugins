export const PLUGIN_NAME = '@xpert-ai/plugin-material-identity-governance'
export const PLUGIN_VERSION = '0.1.0'
export const ARTIFACT_NAMESPACE = 'material_identity'
export const artifactKey = (key: string) => `${ARTIFACT_NAMESPACE}_${key}`
export const VIEW_KEYS = {
  dashboard: artifactKey('operations_dashboard'),
  pipeline: artifactKey('pipeline_overview'),
  workspace: artifactKey('case_workspace'),
} as const

export const APP_ICON = {
  type: 'svg' as const,
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M4 7.5l8 4.5 8-4.5 M12 12v9"/><path d="m8 5.25 8 4.5"/></svg>',
}
