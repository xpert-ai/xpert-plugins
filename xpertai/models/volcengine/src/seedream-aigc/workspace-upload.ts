import {
  SeedreamAigc,
  type SeedreamArtifactFile,
  type SeedreamWorkspaceScope,
  type WorkspaceFile,
  type WorkspaceFilesApi
} from './types.js'

type UploadGeneratedAssetInput = {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SeedreamWorkspaceScope
  buffer: Buffer
  mimeType: string
  folder: string
  fileName: string
  originalName?: string
  metadata?: Record<string, unknown>
}

export async function uploadGeneratedAsset(input: UploadGeneratedAssetInput): Promise<SeedreamArtifactFile> {
  const uploaded = await input.workspaceFiles.uploadBuffer({
    ...input.workspaceScope,
    buffer: input.buffer,
    originalName: input.originalName ?? input.fileName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    folder: input.folder,
    fileName: input.fileName,
    metadata: {
      provider: SeedreamAigc,
      ...input.metadata
    }
  })
  return toArtifactFile(uploaded, input.fileName, input.mimeType)
}

export function toArtifactFile(file: WorkspaceFile, fileName: string, mimeType: string): SeedreamArtifactFile {
  return {
    fileName,
    filePath: file.filePath,
    workspacePath: file.workspacePath ?? file.filePath,
    ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
    ...(file.url ? { url: file.url } : {}),
    mimeType: file.mimeType ?? mimeType,
    size: file.size,
    extension: extensionFromFileName(fileName),
    provider: SeedreamAigc
  }
}

export function extensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'video/mp4') return 'mp4'
  if (mimeType === 'audio/mpeg') return 'mp3'
  if (mimeType.startsWith('image/')) return mimeType.slice('image/'.length) || 'png'
  if (mimeType.startsWith('video/')) return mimeType.slice('video/'.length) || 'mp4'
  return 'bin'
}

function extensionFromFileName(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || 'bin'
}
