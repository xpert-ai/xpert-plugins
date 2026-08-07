import { ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { STORY_STUDIO_PLUGIN_NAME } from './constants.js'
import type { StoryProject } from './entities/index.js'
import {
  STORY_DEMO_ASSETS,
  type StoryDemoAssetKey,
  type StoryDemoMedia
} from './story-demo-case.js'
import type { StoryScope } from './types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export async function uploadStoryDemoAssets(
  workspaceFiles: WorkspaceFilesApi,
  project: StoryProject,
  scope: StoryScope
): Promise<Record<StoryDemoAssetKey, StoryDemoMedia>> {
  const uploaded = await Promise.all(
    STORY_DEMO_ASSETS.map(async (asset) => {
      const buffer = await readFile(
        join(moduleDir, '..', '..', 'assets', 'demo-backlight-reunion', asset.fileName)
      )
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      const written = await workspaceFiles.writeRuntimeBuffer({
        ...demoAssetDestination(project, scope),
        folder: `story-studio/${project.id}/demo-assets`,
        fileName: asset.fileName,
        originalName: asset.fileName,
        mimeType: asset.mimeType,
        buffer,
        metadata: {
          pluginName: STORY_STUDIO_PLUGIN_NAME,
          storyProjectId: project.id,
          demoCase: 'backlight-reunion',
          demoAssetKey: asset.key,
          sha256
        }
      })
      return [
        asset.key,
        {
          key: asset.key,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          ...(written.fileUrl ? { fileUrl: written.fileUrl } : {}),
          workspacePath: written.workspacePath,
          size: written.size ?? buffer.length,
          sha256,
          fileReference: written.reference
        } satisfies StoryDemoMedia
      ] as const
    })
  )
  return {
    'shot-01': requireDemoMedia(uploaded, 'shot-01'),
    'shot-02': requireDemoMedia(uploaded, 'shot-02'),
    'shot-03': requireDemoMedia(uploaded, 'shot-03')
  }
}

function demoAssetDestination(project: StoryProject, scope: StoryScope) {
  if (project.hostProjectId) {
    return {
      tenantId: project.tenantId,
      userId: scope.userId ?? null,
      catalog: 'projects' as const,
      scopeId: project.hostProjectId,
      projectId: project.hostProjectId
    }
  }
  if (!project.assistantId) {
    throw new ServiceUnavailableException(
      'Story demo assets require a host project or Assistant workspace scope.'
    )
  }
  return {
    tenantId: project.tenantId,
    userId: scope.userId ?? null,
    catalog: 'xperts' as const,
    scopeId: project.assistantId,
    xpertId: project.assistantId,
    isolateByUser: false
  }
}

function requireDemoMedia(
  entries: ReadonlyArray<readonly [StoryDemoAssetKey, StoryDemoMedia]>,
  key: StoryDemoAssetKey
) {
  const match = entries.find(([candidate]) => candidate === key)
  if (!match) {
    throw new ServiceUnavailableException(`Story demo asset ${key} was not uploaded.`)
  }
  return match[1]
}
