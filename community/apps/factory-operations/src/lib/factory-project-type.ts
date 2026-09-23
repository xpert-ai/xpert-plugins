import type { XpertProjectTypeRef } from '@xpert-ai/contracts'
import { FACTORY_PLUGIN_NAME } from './constants.js'
export const FACTORY_CASE_PROJECT_TYPE: XpertProjectTypeRef = {
  applicationKey: `${FACTORY_PLUGIN_NAME}:factory-operations`,
  projectTypeKey: 'case'
}
export const FACTORY_CASE_PROJECT_PROVIDER = 'factory_ops_case_project'
