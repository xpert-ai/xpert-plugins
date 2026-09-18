import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const CANDIDATE_INTAKE_PLUGIN_NAME = '@xpert-ai/plugin-candidate-intake'
export const CANDIDATE_INTAKE_VERSION = '0.1.0'
export const CANDIDATE_INTAKE_LEVEL = 'system' as const
export const CANDIDATE_INTAKE_NAMESPACE = 'candidate_intake' as const
export const CANDIDATE_INTAKE_FEATURE = 'candidate-intake'
export const CANDIDATE_INTAKE_MIDDLEWARE = 'candidate_intake.screening'
export const CANDIDATE_INTAKE_VIEW_PROVIDER = 'candidate_intake.view_provider'
export const CANDIDATE_INTAKE_VIEW = 'candidate_intake.hr_workbench'
export const CANDIDATE_INTAKE_REMOTE_ENTRY = 'candidate_intake__hr_workbench'
export const CANDIDATE_INTAKE_ROUTE = 'candidate-intake'

export const JOB_TABLE = pluginArtifactTableName(CANDIDATE_INTAKE_NAMESPACE, 'job')
export const APPLICATION_TABLE = pluginArtifactTableName(CANDIDATE_INTAKE_NAMESPACE, 'application')

export const MAX_RESUME_BYTES = 10 * 1024 * 1024
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export const CANDIDATE_INTAKE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm6 7V8h2v2h2v2h-2v2h-2v-2h-2v-2h2ZM3 19c0-3.31 2.69-6 6-6s6 2.69 6 6v2H3v-2Zm14.5-4c1.93 0 3.5 1.57 3.5 3.5S19.43 22 17.5 22a3.5 3.5 0 1 1 0-7Zm-.5 1v3h2v-1h-1v-2h-1Z"/></svg>'
