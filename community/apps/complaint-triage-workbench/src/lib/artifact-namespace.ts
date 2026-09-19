import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { COMPLAINT_TRIAGE_ARTIFACT_NAMESPACE } from './constants.js'

export function complaintTable(key: string) {
  return pluginArtifactTableName(COMPLAINT_TRIAGE_ARTIFACT_NAMESPACE, key)
}
