import {
  MiniMaxVideo,
  type MiniMaxArtifactFile,
  type MiniMaxWorkspaceFilesApi,
  type MiniMaxWorkspaceScope
} from './types.js'

export async function uploadMiniMaxVideo(input: {
  workspaceFiles: MiniMaxWorkspaceFilesApi
  workspaceScope?: MiniMaxWorkspaceScope
  buffer: Buffer
  mimeType: string
  fileName: string
  taskId: string
}): Promise<MiniMaxArtifactFile> {
  const uploaded = await input.workspaceFiles.uploadBuffer({
    ...input.workspaceScope,
    buffer: input.buffer,
    originalName: input.fileName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    folder: 'files/minimax/videos',
    fileName: input.fileName,
    metadata: { provider: MiniMaxVideo, source: 'minimax_h3_video_generation', taskId: input.taskId }
  })
  return {
    fileName: input.fileName,
    filePath: uploaded.filePath,
    workspacePath: uploaded.workspacePath || uploaded.filePath,
    ...(uploaded.fileUrl ? { fileUrl: uploaded.fileUrl } : {}),
    ...(uploaded.url ? { url: uploaded.url } : {}),
    mimeType: uploaded.mimeType || input.mimeType,
    size: uploaded.size,
    catalog: uploaded.catalog,
    scopeId: uploaded.scopeId,
    extension: 'mp4',
    provider: MiniMaxVideo
  }
}
