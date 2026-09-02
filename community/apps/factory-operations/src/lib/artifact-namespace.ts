import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { FACTORY_ARTIFACT_NAMESPACE } from './constants.js'

export function factoryTable(key: string) {
  return pluginArtifactTableName(FACTORY_ARTIFACT_NAMESPACE, key)
}

export function factoryArtifactKey(localKey: string) {
  return `${FACTORY_ARTIFACT_NAMESPACE}.${localKey}`
}
