import * as React from 'react'
import { createTranslator } from './i18n'
import type { ProjectSummary } from './project-data'
import type {
  Asset,
  AssetReference,
  ProductionView
} from './production-data'
import {
  executeFileAction,
  getErrorMessage,
  getResponsePayload,
  invokeClientCommand,
  isRemoteObject,
  notify,
  requireSuccessfulAction,
  requireSuccessfulActionData,
  type RemoteValue
} from './runtime'
import {
  buildAssetImageAssistantMessage,
  validateAssetImageFile,
  validateVoiceReferenceFile
} from './asset-bible-actions'
import type { AssetReferenceSet } from './asset-reference-data'
import {
  compactVoiceReference,
  type VoiceReferenceLike
} from '../../../voice-reference.js'

const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND =
  'assistant.chat.send_message'

type Translator = ReturnType<typeof createTranslator>

type AssetImageUploadOptions = {
  assetReference?: AssetReference
  select?: boolean
  replaceReference?: boolean
}

type AssetImageUpload = AssetImageUploadOptions & { file: File }

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

  async function upload(
    asset: Asset,
    file: File,
    options: AssetImageUploadOptions = {}
  ) {
    return uploadMany(asset, [{ file, ...options }])
  }

  async function uploadMany(asset: Asset, uploads: AssetImageUpload[]) {
    if (!project) return
    const validation = uploads
      .map((item) => validateAssetImageFile(item.file))
      .find(Boolean)
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
    if (!uploads.length) return
    setActive({ assetId: asset.id, kind: 'upload' })
    try {
      let baseRevision = project.revision
      for (const upload of uploads) {
        const operationId = crypto.randomUUID()
        const assetReference = upload.assetReference ?? { type: 'general' }
        const result = requireSuccessfulAction(
          await executeFileAction(
            'upload_asset_image',
            project.id,
            {
              projectId: project.id,
              operationId,
              baseRevision,
              assetId: asset.id,
              candidateId: `asset-image-${crypto.randomUUID()}`,
              label: upload.file.name,
              assetReference,
              prompt: asset.prompt,
              select: upload.select ?? assetReference.type === 'general',
              replaceReference: upload.replaceReference ?? true,
              changeSummary: t('changes.assetImageUploaded', {
                asset: asset.name
              })
            },
            upload.file
          )
        )
        baseRevision = actionRevision(result) ?? baseRevision + 1
      }
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

  async function generate(
    asset: Asset,
    referenceSet: AssetReferenceSet = 'continuity_views'
  ) {
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
            production,
            referenceSet
          }),
          clientMessageId: `story-studio:asset-image:${project.id}:${asset.id}:${Date.now()}`,
          state: {
            source: '@xpert-ai/plugin-story-studio',
            action: referenceSet === 'expressions'
              ? 'generate_story_asset_expressions'
              : 'generate_story_asset_views',
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

  async function uploadVoiceReference(
    asset: Asset,
    file: File
  ): Promise<VoiceReferenceLike | null> {
    if (!project) return null
    const validation = validateVoiceReferenceFile(file)
    if (validation) {
      notify(
        'error',
        t(
          validation === 'type'
            ? 'errors.voiceReferenceType'
            : 'errors.voiceReferenceSize'
        )
      )
      return null
    }
    setActive({ assetId: asset.id, kind: 'upload' })
    try {
      const referenceId = `voice-reference-${crypto.randomUUID()}`
      const result = requireSuccessfulActionData(
        await executeFileAction(
          'upload_voice_reference_audio',
          project.id,
          {
            projectId: project.id,
            assetId: asset.id,
            referenceId,
            label: file.name.replace(/\.[^.]+$/, '') || file.name
          },
          file
        )
      )
      const voiceReference = parseUploadedVoiceReference(result)
      if (!voiceReference) {
        throw new Error(t('errors.voiceReferenceUploadResult'))
      }
      notify('success', t('asset.voiceReferenceUploaded', { asset: asset.name }))
      return voiceReference
    } catch (error) {
      notify(
        'error',
        getErrorMessage(error instanceof Error ? error : String(error))
      )
      return null
    } finally {
      setActive(null)
    }
  }

  async function uploadShotReference(
    sceneId: string,
    shotId: string,
    prompt: string,
    file: File
  ) {
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
    setActive({ assetId: shotId, kind: 'upload' })
    try {
      const operationId = crypto.randomUUID()
      requireSuccessfulAction(
        await executeFileAction(
          'upload_shot_reference_image',
          project.id,
          {
            projectId: project.id,
            operationId,
            baseRevision: project.revision,
            sceneId,
            shotId,
            candidateId: `shot-reference-${crypto.randomUUID()}`,
            label: file.name,
            prompt,
            changeSummary: t('changes.shotReferenceUploaded', { shot: shotId })
          },
          file
        )
      )
      notify('success', t('director.storyboard.temporaryReferenceUploaded'))
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

  return {
    active,
    upload,
    uploadMany,
    uploadVoiceReference,
    generate,
    uploadShotReference
  }
}

function parseUploadedVoiceReference(value: RemoteValue) {
  if (!isRemoteObject(value) || !isRemoteObject(value.voiceReference)) {
    return null
  }
  const source = value.voiceReference
  return compactVoiceReference({
    url: typeof source.url === 'string' ? source.url : null,
    label: typeof source.label === 'string' ? source.label : null,
    workspacePath:
      typeof source.workspacePath === 'string' ? source.workspacePath : null,
    originalName:
      typeof source.originalName === 'string' ? source.originalName : null,
    mimeType: typeof source.mimeType === 'string' ? source.mimeType : null,
    size: typeof source.size === 'number' ? source.size : null
  })
}

function actionRevision(value: Parameters<typeof isRemoteObject>[0]) {
  if (!isRemoteObject(value)) return null
  if (typeof value.revision === 'number') return value.revision
  return isRemoteObject(value.data) && typeof value.data.revision === 'number'
    ? value.data.revision
    : null
}
