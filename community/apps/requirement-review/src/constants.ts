export const PLUGIN_NAME = '@community/apps-requirement-review'
export const PLUGIN_ARTIFACT_NAMESPACE = 'reqtrace'
export const artifactKey = (key: string) =>
  `${PLUGIN_ARTIFACT_NAMESPACE}.${key}`
export const PROVIDER = artifactKey('review')
export const FEATURE = artifactKey('workbench')
export const VIEW = artifactKey('workbench')
export const TOOLS = {
  read: `${PLUGIN_ARTIFACT_NAMESPACE}_read_analysis_source`,
  submit: `${PLUGIN_ARTIFACT_NAMESPACE}_submit_analysis_draft`,
  fail: `${PLUGIN_ARTIFACT_NAMESPACE}_report_analysis_failure`
}
export const ICON = {
  type: 'svg',
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  alt: 'ReqTrace'
} as const
