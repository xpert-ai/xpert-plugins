import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { STORY_STUDIO_ARTIFACT_NAMESPACE } from './constants.js'

export function storyStudioTable(key: string) {
  return pluginArtifactTableName(STORY_STUDIO_ARTIFACT_NAMESPACE, key)
}

export function storyStudioArtifactKey(localKey: string) {
  return `${STORY_STUDIO_ARTIFACT_NAMESPACE}.${localKey}`
}
