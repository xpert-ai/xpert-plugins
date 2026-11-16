import { Logger } from '@nestjs/common'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { ConversationResourceCard } from '@xpert-ai/contracts'
import { emitResourceCard, type ContentEditorResolution } from '@xpert-ai/plugin-sdk'
import { PPTX_NAMESPACE, PPTX_VIEW, PPTX_VIEW_PROVIDER } from './constants.js'
import { digest } from './ai-receipts.js'
import { PRESENTATION_VIEW_ICON } from './view-icons.js'

const logger = new Logger('PptxResourceCard')

/** One delivery identity per original file; editing and downloading resolve independently. */
export function pptxResourceCard(projectId: string, filePath: string, title: string, resolved: ContentEditorResolution,
  options: { slideCount?: number; coverHash?: string; download?: { filePath: string; resolved: ContentEditorResolution } } = {}): ConversationResourceCard {
  const { viewKey, selectionId, parameters } = resolved
  if (viewKey !== `${PPTX_VIEW_PROVIDER}__${PPTX_VIEW}` || !selectionId || !parameters)
    throw new Error('pptx.preview_unavailable')
  const download = options.download ?? { filePath, resolved }
  const target = download.resolved
  if (target.viewKey !== `${PPTX_VIEW_PROVIDER}__${PPTX_VIEW}` || !target.selectionId)
    throw new Error('pptx.preview_unavailable')
  const reference = target.resource?.resourceRef ?? { providerKey: 'platform.workspace.file', resourceId: target.selectionId, filePath: download.filePath }
  const id = digest({ projectId, filePath })
  const content: NonNullable<ConversationResourceCard['content']> = []
  if (options.coverHash) content.push({ kind: 'image-gallery', images: [{ id: options.coverHash, title,
    file: { viewKey: target.viewKey, targetId: target.selectionId,
      fileKey: JSON.stringify({ kind: 'cover', source: reference, sha256: options.coverHash }) } }] })
  content.push({ kind: 'file-list', files: [{ id: digest({ projectId, filePath: download.filePath }), title,
    file: { viewKey: target.viewKey, targetId: target.selectionId, fileKey: JSON.stringify(reference) } }] })
  return {
    resource: { namespace: PPTX_NAMESPACE, type: 'presentation', id }, title,
    description: options.slideCount ? `PPTX · ${options.slideCount} ${options.slideCount === 1 ? 'slide' : 'slides'}` : 'PPTX',
    icon: { type: PRESENTATION_VIEW_ICON.type, value: PRESENTATION_VIEW_ICON.value },
    open: { target: 'assistant.project', projectId, viewKey, selectionId, parameters },
    content
  }
}

/** Delivery is best-effort after the file commit; never turn a successful export into a failed mutation. */
export async function emitPptxCard(resolve: () => Promise<ConversationResourceCard>, config?: RunnableConfig) {
  try {
    await emitResourceCard(await resolve(), config)
    return { status: 'emitted' as const }
  } catch {
    logger.warn('PPTX export succeeded; resource card delivery unavailable')
    return { status: 'unavailable' as const }
  }
}
