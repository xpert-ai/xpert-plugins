import {
  VeoToolsetName,
  type VeoArtifactFile,
  type VeoWorkspaceScope,
  type WorkspaceFile,
  type WorkspaceFilesApi
} from './types.js'

type UploadGeneratedVideoInput = {
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: VeoWorkspaceScope
  buffer: Buffer
  fileName: string
  mimeType: string
  taskId: string
}

export async function uploadGeneratedVideo(
  input: UploadGeneratedVideoInput
): Promise<VeoArtifactFile> {
  const uploaded = await input.workspaceFiles.uploadBuffer({
    ...input.workspaceScope,
    buffer: input.buffer,
    originalName: input.fileName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    folder: 'files/veo/videos',
    fileName: input.fileName,
    metadata: {
      provider: VeoToolsetName,
      source: 'gemini_veo_generation',
      taskId: input.taskId
    }
  })
  return toArtifactFile(uploaded, input.fileName, input.mimeType)
}

function toArtifactFile(
  file: WorkspaceFile,
  fileName: string,
  mimeType: string
): VeoArtifactFile {
  return {
    fileName,
    filePath: file.filePath,
    workspacePath: file.workspacePath ?? file.filePath,
    ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
    ...(file.url ? { url: file.url } : {}),
    mimeType: file.mimeType ?? mimeType,
    size: file.size,
    catalog: file.catalog,
    scopeId: file.scopeId,
    extension: 'mp4',
    provider: VeoToolsetName
  }
}
