import type { XpertProjectTypeRef } from '@xpert-ai/contracts'
import { PLUGIN_NAME, artifactKey } from '../artifact-namespace.js'

export const MATERIAL_PROJECT_TYPE: XpertProjectTypeRef = {
  applicationKey: `${PLUGIN_NAME}:material-identity-governance`, projectTypeKey: 'case'
}

export const MATERIAL_PROJECT_PROVIDER = artifactKey('case_project')
