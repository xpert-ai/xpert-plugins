import * as React from 'react'
import { createTranslator } from './i18n'
import type { ProjectSummary } from './project-data'
import type { Asset, ProductionView } from './production-data'
import {
  executeFileAction,
  getErrorMessage,
  getResponsePayload,
  invokeClientCommand,
  isRemoteObject,
  notify,
  requireSuccessfulAction
} from './runtime'
import {
  buildAssetImageAssistantMessage,
  validateAssetImageFile
} from './asset-bible-actions'

const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND =
  'assistant.chat.send_message'

type Translator = ReturnType<typeof createTranslator>

export function useAssetBibleActions(input: {
  project: ProjectSummary | null
  production: ProductionView | null
  reload: (projectId: string) => Promise<unknown>
  t: Translator
}) {
  const { project, production, reload, t } = input
  const [active, setActive] = React.useState<{
    assetId: string
    kind: 'upload' | 'generate'
  } | null>(null)

  async function upload(asset: Asset, file: File) {
    if (!project) return
    const validation = validateAssetImageFile(file)
    if (validation) {
      notify(
        'error',
        t(
          validation === 'type'
            ? 'errors.assetImageType'
            : 'errors.assetImageSize'
        )
      )
      return
    }
    setActive({ assetId: asset.id, kind: 'upload' })
    try {
      const operationId = crypto.randomUUID()
      requireSuccessfulAction(
        await executeFileAction(
          'upload_asset_image',
          project.id,
          {
            projectId: project.id,
            operationId,
            baseRevision: project.revision,
            assetId: asset.id,
            candidateId: `asset-image-${crypto.randomUUID()}`,
            label: file.name,
            prompt: asset.prompt,
            select: true,
            changeSummary: t('changes.assetImageUploaded', {
              asset: asset.name
            })
          },
          file
        )
      )
      notify('success', t('asset.uploaded', { asset: asset.name }))
      await reload(project.id)
    } catch (error) {
      notify(
        'error',
        getErrorMessage(error instanceof Error ? error : String(error))
      )
    } finally {
      setActive(null)
    }
  }

  async function generate(asset: Asset) {
    if (!project || !production) return
    setActive({ assetId: asset.id, kind: 'generate' })
    try {
      const response = await invokeClientCommand(
        ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        {
          text: buildAssetImageAssistantMessage({
            projectId: project.id,
            revision: project.revision,
            asset,
            production
          }),
          clientMessageId: `story-studio:asset-image:${project.id}:${asset.id}:${Date.now()}`,
          state: {
            source: '@xpert-ai/plugin-story-studio',
            action: 'generate_story_asset_image',
            projectId: project.id,
            assetId: asset.id
          }
        }
      )
      const result = getResponsePayload(response)
      if (isRemoteObject(result) && result.success === false) {
        throw new Error(
          typeof result.message === 'string'
            ? result.message
            : t('asset.generationFailed')
        )
      }
      notify(
        'success',
        t('asset.generationSent', { asset: asset.name })
      )
    } catch (error) {
      notify(
        'error',
        getErrorMessage(error instanceof Error ? error : String(error))
      )
    } finally {
      setActive(null)
    }
  }

  return {
    active,
    upload,
    generate
  }
}
