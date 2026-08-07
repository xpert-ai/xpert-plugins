import { KlingVideo, type KlingArtifactFile, type KlingToolDependencies } from './types.js'

const VIDEO_FOLDER = 'files/kling/videos'

export async function uploadGeneratedVideo(
  deps: KlingToolDependencies,
  taskId: string,
  buffer: Buffer,
  mimeType?: string
): Promise<KlingArtifactFile> {
  const fileName = `${safeName(taskId)}.mp4`
  const uploaded = await deps.workspaceFiles.uploadBuffer({
    ...deps.workspaceScope,
    buffer,
    originalName: fileName,
    fileName,
    folder: VIDEO_FOLDER,
    mimeType: mimeType === 'video/mp4' ? mimeType : 'video/mp4',
    size: buffer.length,
    metadata: {
      provider: KlingVideo,
      source: 'kling_video_generation',
      taskId
    }
  })

  return {
    fileName,
    filePath: uploaded.filePath,
    workspacePath: uploaded.workspacePath,
    fileUrl: uploaded.fileUrl,
    url: uploaded.url,
    mimeType: uploaded.mimeType || 'video/mp4',
    size: uploaded.size ?? buffer.length,
    catalog: uploaded.catalog,
    scopeId: uploaded.scopeId,
    extension: 'mp4',
    provider: KlingVideo
  }
}

function safeName(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 100)
  return safe || 'kling-video'
}
