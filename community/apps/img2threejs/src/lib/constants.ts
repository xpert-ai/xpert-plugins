import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const IMG2THREEJS_PLUGIN_NAME = '@xpert-ai/plugin-img2threejs' as const
export const IMG2THREEJS_ARTIFACT_NAMESPACE = 'img2threejs' as const

export const artifactKey = (localKey: string): string =>
  `${IMG2THREEJS_ARTIFACT_NAMESPACE}.${localKey}`

export const IMG2THREEJS_TABLES = {
  project: pluginArtifactTableName(IMG2THREEJS_ARTIFACT_NAMESPACE, 'project'),
  imageEvidence: pluginArtifactTableName(IMG2THREEJS_ARTIFACT_NAMESPACE, 'image_evidence'),
  sculptSpec: pluginArtifactTableName(IMG2THREEJS_ARTIFACT_NAMESPACE, 'sculpt_spec'),
  codeVersion: pluginArtifactTableName(IMG2THREEJS_ARTIFACT_NAMESPACE, 'code_version'),
  pipelineRun: pluginArtifactTableName(IMG2THREEJS_ARTIFACT_NAMESPACE, 'pipeline_run')
} as const

export const IMG2THREEJS_PROVIDER_KEY = artifactKey('view-provider')
export const IMG2THREEJS_VIEW_KEY = artifactKey('review-workbench')
export const IMG2THREEJS_REMOTE_ENTRY_KEY = artifactKey('review-remote')
export const IMG2THREEJS_MIDDLEWARE_NAME = artifactKey('agent-tools')
export const IMG2THREEJS_TEMPLATE_PROVIDER_KEY = artifactKey('assistant-templates')
export const IMG2THREEJS_QUEUE_NAME = artifactKey('pipeline')
export const IMG2THREEJS_STAGE_JOB_NAME = artifactKey('run-stage')
export const IMG2THREEJS_RENDER_JOB_NAME = artifactKey('review-render')
export const IMG2THREEJS_SANDBOX_ACTION = 'img2threejs.review-render' as const
export const IMG2THREEJS_SANDBOX_ACTION_VERSION = '1.0.0' as const
export const IMG2THREEJS_ROUTE_PREFIX = `${IMG2THREEJS_ARTIFACT_NAMESPACE}/projects`
export const IMG2THREEJS_FEATURE = artifactKey('procedural-modeling')

export const BUILD_STAGES = [
  'blockout',
  'structural-pass',
  'form-refinement',
  'material-pass',
  'surface-pass',
  'lighting-pass',
  'interaction-pass',
  'optimization-pass'
] as const

export const NEXT_DECISIONS = [
  'continue',
  'refine-spec',
  'refine-code',
  'request-input',
  'stop'
] as const

export const TOOL_NAMES = {
  createProject: 'img2threejs_create_project',
  listProjects: 'img2threejs_list_projects',
  submitImages: 'img2threejs_submit_images',
  listEvidence: 'img2threejs_list_evidence',
  readEvidence: 'img2threejs_read_evidence',
  readSpec: 'img2threejs_read_spec',
  updateSpec: 'img2threejs_update_spec',
  patchSpec: 'img2threejs_patch_spec',
  patchRuntimeContract: 'img2threejs_patch_runtime_contract',
  validateSpec: 'img2threejs_validate_spec',
  readCode: 'img2threejs_read_code',
  inspectCodeFile: 'img2threejs_inspect_code_file',
  authorCodeFile: 'img2threejs_author_code_file',
  authorCode: 'img2threejs_author_code',
  revalidateCode: 'img2threejs_revalidate_code',
  patchCode: 'img2threejs_patch_code',
  refineCode: 'img2threejs_refine_code',
  enqueueStage: 'img2threejs_enqueue_stage',
  waitRun: 'img2threejs_wait_run',
  getStatus: 'img2threejs_get_status',
  submitReview: 'img2threejs_submit_review',
  readVisualDiagnostics: 'img2threejs_read_visual_diagnostics',
  readArtifact: 'img2threejs_read_artifact',
  exportArtifact: 'img2threejs_export_artifact',
  cancelRun: 'img2threejs_cancel_run',
  retryRun: 'img2threejs_retry_run'
} as const

export const IMG2THREEJS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none"><rect x="24" y="24" width="208" height="208" rx="40" fill="#EDE9FE"/><path d="m128 58 58 34v68l-58 34-58-34V92l58-34Z" fill="#7C3AED"/><path d="m128 58 58 34-58 34-58-34 58-34Z" fill="#A78BFA"/><path d="M128 126v68m-58-102 58 34 58-34" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><circle cx="187" cy="184" r="21" fill="#14B8A6"/><path d="m177 184 7 7 13-15" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
