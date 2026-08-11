import {
  ZhipuCogVideo,
  type ZhipuArtifactFile,
  type ZhipuWorkspaceScope,
  type WorkspaceFile,
  type WorkspaceFilesApi
} from './types.js'

export async function uploadGeneratedAsset(input: {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: ZhipuWorkspaceScope
  buffer: Buffer
  mimeType: string
  folder: string
  fileName: string
  metadata?: Record<string, unknown>
}): Promise<ZhipuArtifactFile> {
  const uploaded = await input.workspaceFiles.uploadBuffer({
    ...input.workspaceScope,
    buffer: input.buffer,
    originalName: input.fileName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    folder: input.folder,
    fileName: input.fileName,
    metadata: {
      provider: ZhipuCogVideo,
      ...input.metadata
    }
  })

  return toArtifactFile(uploaded, input.fileName, input.mimeType)
}

function toArtifactFile(file: WorkspaceFile, fileName: string, mimeType: string): ZhipuArtifactFile {
  return {
    fileName,
    filePath: file.filePath,
    workspacePath: file.workspacePath || file.filePath,
    ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
    ...(file.url ? { url: file.url } : {}),
    mimeType: file.mimeType || mimeType,
    size: file.size,
    catalog: file.catalog,
    scopeId: file.scopeId,
    extension: extensionFromFileName(fileName),
    provider: ZhipuCogVideo
  }
}

export function extensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'video/mp4') return 'mp4'
  if (mimeType.startsWith('image/')) return mimeType.slice('image/'.length) || 'png'
  if (mimeType.startsWith('video/')) return mimeType.slice('video/'.length) || 'mp4'
  return 'bin'
}

function extensionFromFileName(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || 'bin'
}
