import { Logger } from '@nestjs/common'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { ConversationResourceCard } from '@xpert-ai/contracts'
import { emitResourceCard, type ContentEditorResolution } from '@xpert-ai/plugin-sdk'
import { DOCX_VIEW, DOCX_VIEW_PROVIDER } from './constants.js'
import { digest } from './ai-receipts.js'
const logger = new Logger('DocxFileCard')
export function docxResourceCard(projectId: string, filePath: string, title: string, resolved: ContentEditorResolution,
  download: { filePath: string; resolved: ContentEditorResolution }): ConversationResourceCard {
  if (resolved.viewKey !== `${DOCX_VIEW_PROVIDER}__${DOCX_VIEW}` || !resolved.selectionId || !resolved.parameters ||
    download.resolved.viewKey !== resolved.viewKey || !download.resolved.selectionId) throw new Error('docx.preview_unavailable')
  const reference = download.resolved.resource?.resourceRef ?? { providerKey: 'platform.workspace.file', resourceId: download.resolved.selectionId, filePath: download.filePath }
  return { resource: { namespace: 'docx_editor', type: 'document', id: digest({ projectId, filePath }) }, title, description: 'DOCX',
    open: { target: 'assistant.project', projectId, viewKey: resolved.viewKey, selectionId: resolved.selectionId, parameters: resolved.parameters },
    content: [{ kind: 'file-list', files: [{ id: digest({ projectId, filePath: download.filePath }), title,
      file: { viewKey: download.resolved.viewKey, targetId: download.resolved.selectionId, fileKey: JSON.stringify(reference) } }] }] }
}
export async function emitDocxCard(resolve: () => Promise<ConversationResourceCard>, config?: RunnableConfig) {
  try { await emitResourceCard(await resolve(), config); return { status: 'emitted' as const } }
  catch { logger.warn('DOCX saved; resource card delivery unavailable'); return { status: 'unavailable' as const } }
}
