import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { ArtifactsApi, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import {
  VIEW_IMAGE_ARTIFACT_FOLDER,
  VIEW_IMAGE_ARTIFACT_RESOURCE_TYPE,
  VIEW_IMAGE_PLUGIN_NAME,
  type ViewedImageItem
} from './view-image.types.js'

export type PreparedViewedImage = {
  item: ViewedImageItem
  buffer: Buffer
  sha256: string
}

export type ViewImageOutputRuntime = {
  artifacts: Pick<ArtifactsApi, 'createArtifact' | 'ensureArtifactVersion'>
  workspaceFiles: Pick<WorkspaceFilesApi, 'writeRuntimeBuffer'>
}

/**
 * @deprecated Compatibility-only local mirror of the ChatKit `xpert.tool-output`
 * image attachment contract. Use the canonical platform contract from
 * `@xpert-ai/contracts` once it is exported by the host SDK.
 */
export type ViewImageToolOutputAttachment = {
  type: 'image'
  artifactId: string
  artifactVersionId: string
  sha256: string
  mimeType: ViewedImageItem['mimeType']
  width?: number
  height?: number
  title: string
  alt: string
  source: 'sandbox'
  modelDetail: 'low'
}

/**
 * @deprecated Compatibility-only local mirror of the ChatKit `xpert.tool-output`
 * presentation contract. Use the canonical platform contract from
 * `@xpert-ai/contracts` once it is exported by the host SDK.
 */
export type ViewImageToolOutputPresentation = {
  type: 'xpert.tool-output'
  version: 1
  attachments: ViewImageToolOutputAttachment[]
}

export async function createViewImageToolOutputPresentation(
  images: PreparedViewedImage[],
  runtime: ViewImageOutputRuntime
): Promise<ViewImageToolOutputPresentation> {
  const attachments = await Promise.all(
    images.map(async ({ item, buffer, sha256 }): Promise<ViewImageToolOutputAttachment> => {
      const fileName = `${sha256}.${extensionForMimeType(item.mimeType)}`
      const written = await runtime.workspaceFiles.writeRuntimeBuffer({
        buffer,
        originalName: item.fileName,
        mimeType: item.mimeType,
        size: buffer.length,
        folder: VIEW_IMAGE_ARTIFACT_FOLDER,
        fileName,
        metadata: stableImageMetadata(item, sha256)
      })
      const artifact = await runtime.artifacts.createArtifact({
        source: {
          pluginName: VIEW_IMAGE_PLUGIN_NAME,
          resourceType: VIEW_IMAGE_ARTIFACT_RESOURCE_TYPE,
          resourceId: createHash('sha256').update(item.downloadPath).digest('hex'),
          checksum: sha256
        },
        kind: 'image',
        title: item.fileName,
        description: 'Sandbox image prepared for an Agent vision step.',
        metadata: stableImageMetadata(item, sha256)
      })
      const { version } = await runtime.artifacts.ensureArtifactVersion({
        artifactId: artifact.id,
        idempotencyKey: sha256,
        workspaceFileRef: written.reference,
        mimeType: item.mimeType,
        fileName,
        title: item.fileName,
        size: buffer.length,
        sha256,
        checksum: sha256,
        setCurrent: true,
        metadata: stableImageMetadata(item, sha256)
      })

      return {
        type: 'image',
        artifactId: artifact.id,
        artifactVersionId: version.id,
        sha256: version.sha256 ?? sha256,
        mimeType: item.mimeType,
        ...(item.width ? { width: item.width } : {}),
        ...(item.height ? { height: item.height } : {}),
        title: item.fileName,
        alt: item.fileName,
        source: 'sandbox',
        modelDetail: 'low'
      }
    })
  )

  return {
    type: 'xpert.tool-output',
    version: 1,
    attachments
  }
}

function stableImageMetadata(item: ViewedImageItem, sha256: string) {
  return {
    source: 'sandbox',
    originalName: item.fileName,
    modelDetail: 'low',
    mimeType: item.mimeType,
    sha256,
    ...(item.width ? { width: item.width } : {}),
    ...(item.height ? { height: item.height } : {})
  }
}

function extensionForMimeType(mimeType: ViewedImageItem['mimeType']) {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
  }
}
