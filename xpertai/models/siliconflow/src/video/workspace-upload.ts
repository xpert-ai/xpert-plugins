import {
  SiliconflowVideo,
  type SiliconflowArtifactFile,
  type SiliconflowWorkspaceScope,
  type WorkspaceFile,
  type WorkspaceFilesApi
} from './types.js'

export async function uploadGeneratedAsset(input: {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SiliconflowWorkspaceScope
  buffer: Buffer
  mimeType: string
  folder: string
  fileName: string
  metadata?: Record<string, unknown>
}): Promise<SiliconflowArtifactFile> {
  const uploaded = await input.workspaceFiles.uploadBuffer({
    ...input.workspaceScope,
    buffer: input.buffer,
    originalName: input.fileName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    folder: input.folder,
    fileName: input.fileName,
    metadata: {
      provider: SiliconflowVideo,
      ...input.metadata
    }
  })

  return toArtifactFile(uploaded, input.fileName, input.mimeType)
}

function toArtifactFile(file: WorkspaceFile, fileName: string, mimeType: string): SiliconflowArtifactFile {
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
    provider: SiliconflowVideo
  }
}

export function extensionFromMimeType(mimeType: string) {
  if (mimeType === 'video/mp4') return 'mp4'
  if (mimeType === 'video/webm') return 'webm'
  if (mimeType.startsWith('video/')) return mimeType.slice('video/'.length) || 'mp4'
  return 'mp4'
}

function extensionFromFileName(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || 'mp4'
}
