jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import type { WorkspaceRuntimeFileBuffer } from '@xpert-ai/plugin-sdk'
import { StoryGeneratedMediaService } from './story-generated-media.service.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryScope } from './types.js'

const scope: StoryScope = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  workspaceId: 'workspace-a',
  hostProjectId: 'host-project-a',
  userId: 'user-a',
  assistantId: 'assistant-a'
}

function createHarness() {
  const project = {
    id: '00000000-0000-4000-8000-000000000001',
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope),
    revision: 4,
    candidateCount: 1
  }
  const production = {
    id: '00000000-0000-4000-8000-000000000002',
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope),
    projectId: project.id,
    projectRevision: 4,
    documentRevision: 2,
    operationId: 'production:existing',
    inputChecksum: 'existing',
    changeSummary: 'Existing production',
    lastEditedById: null,
    scenes: [
      {
        id: 'scene-1',
        order: 1,
        title: 'Rain gate',
        summary: 'The heroine enters.',
        shots: [
          {
            id: 'shot-1',
            title: 'Push the gate',
            composition: 'A vertical full shot.',
            action: 'The gate opens in the rain.',
            camera: 'Slow push-in',
            durationSeconds: 5,
            candidates: [
              {
                id: 'shot-1-image',
                kind: 'image',
                label: 'Storyboard frame',
                selected: true
              }
            ]
          }
        ]
      }
    ]
  }
  const logs = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value)
  }
  const projects = {
    findOne: jest.fn().mockResolvedValue(project),
    update: jest.fn().mockResolvedValue({ affected: 1 })
  }
  const productions = {
    findOne: jest.fn().mockResolvedValue(production),
    save: jest.fn(async (value) => value)
  }
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity.name === 'StoryProject') return projects
      if (entity.name === 'StoryProduction') return productions
      return logs
    })
  }
  const projectRoot = {
    manager: {
      transaction: jest.fn(async (handler) => handler(manager))
    }
  }
  const service = new StoryGeneratedMediaService(
    projectRoot as never,
    {} as never,
    {} as never
  )
  return {
    service,
    project,
    production,
    projects,
    productions,
    logs
  }
}

function generatedVideo(): WorkspaceRuntimeFileBuffer {
  const buffer = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypisom'),
    Buffer.from('seedance-video')
  ])
  return {
    name: 'seedance-task.mp4',
    filePath: 'files/seedream-aigc/videos/seedance-task.mp4',
    workspacePath:
      '/workspace/files/seedream-aigc/videos/seedance-task.mp4',
    fileUrl: 'http://localhost/files/seedance-task.mp4',
    mimeType: 'video/mp4',
    size: buffer.length,
    catalog: 'xperts',
    scopeId: 'assistant-a',
    buffer,
    reference: {
      source: 'platform.workspace.files',
      filePath: 'files/seedream-aigc/videos/seedance-task.mp4',
      workspacePath:
        '/workspace/files/seedream-aigc/videos/seedance-task.mp4',
      tenantId: 'tenant-a',
      catalog: 'xperts',
      scopeId: 'assistant-a',
      xpertId: 'assistant-a',
      isolateByUser: false,
      originalName: 'seedance-task.mp4',
      mimeType: 'video/mp4',
      size: buffer.length
    }
  }
}

describe('StoryGeneratedMediaService', () => {
  it('attaches a completed Workspace MP4 and selects it for the shot', async () => {
    const harness = createHarness()
    const result = await harness.service.attachGeneratedVideo(
      scope,
      {
        projectId: harness.project.id,
        operationId: 'seedance:attach:0001',
        baseRevision: 4,
        sceneId: 'scene-1',
        shotId: 'shot-1',
        candidateId: 'seedance-task-1',
        label: 'Seedance motion candidate',
        file: generatedVideo().reference,
        prompt: 'Rain moves across the gate.',
        providerReceipt: {
          provider: 'seedream_aigc',
          taskId: 'seedance-task-1',
          model: 'doubao-seedance-2-0-fast-260128',
          status: 'succeeded'
        },
        select: true,
        changeSummary: 'Attached completed Seedance video'
      },
      generatedVideo()
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        duplicate: false,
        revision: 5,
        candidate: expect.objectContaining({
          id: 'seedance-task-1',
          kind: 'video',
          selected: true,
          workspacePath:
            '/workspace/files/seedream-aigc/videos/seedance-task.mp4'
        })
      })
    )
    const candidates =
      harness.production.scenes[0].shots[0].candidates
    expect(candidates).toHaveLength(2)
    expect(candidates[0].selected).toBe(false)
    expect(candidates[1]).toEqual(
      expect.objectContaining({
        kind: 'video',
        selected: true,
        fileReference: expect.objectContaining({
          source: 'platform.workspace.files',
          tenantId: 'tenant-a'
        })
      })
    )
    expect(harness.projects.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        revision: 5,
        candidateCount: 2
      })
    )
    expect(harness.logs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'generated_video_attached',
        previousRevision: 4,
        resultingRevision: 5
      })
    )
  })

  it('rebases a stale production plan when appending generated media', async () => {
    const harness = createHarness()
    harness.production.projectRevision = 3

    const result = await harness.service.attachGeneratedVideo(
      scope,
      {
        projectId: harness.project.id,
        operationId: 'seedance:attach:stale-production',
        baseRevision: 4,
        sceneId: 'scene-1',
        shotId: 'shot-1',
        candidateId: 'seedance-task-stale-production',
        label: 'Seedance synchronized-audio candidate',
        file: generatedVideo().reference,
        providerReceipt: {
          provider: 'seedream_aigc',
          taskId: 'seedance-task-stale-production',
          status: 'succeeded'
        },
        select: true,
        changeSummary:
          'Rebased production plan while appending completed Seedance video'
      },
      generatedVideo()
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        revision: 5
      })
    )
    expect(harness.production.projectRevision).toBe(5)
    expect(harness.production.scenes[0].shots[0].candidates).toHaveLength(2)
  })

  it('rejects provider tasks that are not complete', async () => {
    const harness = createHarness()
    await expect(
      harness.service.attachGeneratedVideo(
        scope,
        {
          projectId: harness.project.id,
          operationId: 'seedance:attach:0002',
          baseRevision: 4,
          sceneId: 'scene-1',
          shotId: 'shot-1',
          candidateId: 'seedance-task-2',
          label: 'Pending candidate',
          file: generatedVideo().reference,
          providerReceipt: {
            provider: 'seedream_aigc',
            taskId: 'seedance-task-2',
            status: 'processing'
          },
          changeSummary: 'Attached pending Seedance video'
        },
        generatedVideo()
      )
    ).rejects.toThrow(
      'Only a completed Seedance task can be attached'
    )
  })
})
