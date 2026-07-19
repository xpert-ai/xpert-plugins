import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { CANVAS_ARTIFACT_NAMESPACE } from './constants.js'

export function canvasTable(key: string) {
  return pluginArtifactTableName(CANVAS_ARTIFACT_NAMESPACE, key)
}
