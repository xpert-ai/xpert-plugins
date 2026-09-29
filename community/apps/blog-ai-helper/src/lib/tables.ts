import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { BLOG_AI_HELPER_ARTIFACT_NAMESPACE } from './constants.js'

export const BLOG_ARTICLE_RECORD_TABLE = pluginArtifactTableName(BLOG_AI_HELPER_ARTIFACT_NAMESPACE, 'article_record')
