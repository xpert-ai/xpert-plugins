jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: Symbol('managed-queue'),
  ArtifactsRuntimeCapability: { id: 'platform.artifacts' },
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  SYSTEM_GLOBAL_SCOPE: 'system:global',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities'),
  isSandboxJobRuntimeError: () => false,
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import {
  ArtifactsRuntimeCapability,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { StoryProductionService } from './story-production.service.js'
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
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    hostProjectId: scope.hostProjectId,
    scopeKey: buildStoryScopeKey(scope),
    assistantId: scope.assistantId,
    title: 'Memory Courier',
    aspectRatio: '9:16',
    status: 'planning',
    revision: 3
  }
  const production = {
    id: '00000000-0000-4000-8000-000000000002',
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    hostProjectId: scope.hostProjectId,
    scopeKey: buildStoryScopeKey(scope),
    projectId: project.id,
    projectRevision: 3,
    documentRevision: 1,
    sourceSynopsis: 'A courier receives a warning from her future self.',
    adaptationGoal: 'A compact science-fiction reversal.',
    visualStyle: 'Neon rain and amber memory fragments.',
    audience: 'Young adult viewers.',
    characters: [{ id: 'lin', name: 'Lin' }],
    scenes: [
      {
        id: 'delivery',
        order: 1,
        title: 'The warning',
        summary: 'The impossible camera turns on.',
        shots: [
          {
            id: 'camera',
            title: 'Camera wakes',
            composition: 'Close-up of a cracked camera.',
            action: 'The display shows Lin ten years older.',
            camera: 'Slow push-in',
            dialogue: 'Do not make the delivery.',
            durationSeconds: 6,
            candidates: [
              {
                id: 'camera-still',
                kind: 'image',
                label: 'Selected camera still',
                selected: true,
                originalName: 'camera-still.png',
                mimeType: 'image/png',
                size: 2048,
                sha256: 'a'.repeat(64),
                fileReference: {
                  source: 'platform.workspace.files',
                  filePath: 'story-studio/project/camera-still.png',
                  workspacePath: 'story-studio/project/camera-still.png',
                  tenantId: 'tenant-a',
                  originalName: 'camera-still.png'
                }
              }
            ]
          }
        ]
      }
    ],
    inputChecksum: 'production-checksum',
    operationId: 'production:memory:001',
    changeSummary: 'Saved production',
    updatedAt: new Date('2026-07-25T00:00:00.000Z')
  }
  let renderRow: Record<string, unknown> | null = null
  const projects = {
    findOne: jest.fn().mockResolvedValue(project)
  }
  const productions = {
    findOne: jest.fn().mockResolvedValue(production)
  }
  const renders = {
    findOne: jest.fn().mockImplementation(async () => renderRow),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      renderRow = {
        id: '00000000-0000-4000-8000-000000000003',
        createdAt: new Date('2026-07-25T00:01:00.000Z'),
        ...value
      }
      return renderRow
    })
  }
  const logs = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value)
  }
  const sandbox = {
    getActionHealth: jest.fn().mockResolvedValue({
      available: true,
      runtimeProfile: 'browser/video-playwright-1.61/v1'
    }),
    run: jest.fn().mockResolvedValue({
      id: 'sandbox-job-1',
      action: 'story-studio.storyboard-render',
      actionVersion: '1.1.0',
      runtimeProfile: 'browser/video-playwright-1.61/v1',
      sandboxRuntimeVersion: 'runtime-1',
      attempt: 1,
      outputs: [
        {
          path: 'storyboard.mp4',
          workspacePath: 'story-studio/project/render.mp4',
          fileUrl: 'http://localhost/files/render.mp4',
          mimeType: 'video/mp4',
          size: 4096,
          sha256: 'video-checksum',
          reference: {
            source: 'platform.workspace.files',
            filePath: 'story-studio/project/render.mp4',
            workspacePath: 'story-studio/project/render.mp4'
          }
        }
      ]
    })
  }
  const queue = {
    getExecutionPoolHealth: jest.fn().mockResolvedValue({
      available: true,
      workerCount: 1
    }),
    enqueue: jest.fn().mockResolvedValue({ jobId: 'managed-job-1' })
  }
  const artifacts = {
    createArtifact: jest.fn().mockResolvedValue({
      id: 'artifact-1'
    }),
    ensureArtifactVersion: jest.fn().mockResolvedValue({
      outcome: 'created',
      version: { id: 'artifact-version-1' }
    }),
    createSignedPreviewLink: jest.fn().mockResolvedValue({
      publicUrl: 'http://localhost/artifacts/preview/storyboard'
    })
  }
  const capabilities = {
    get: jest.fn((capability) => {
      if (capability === SandboxJobsRuntimeCapability) return sandbox
      if (capability === WorkspaceFilesRuntimeCapability) return {}
      if (capability === ArtifactsRuntimeCapability) return artifacts
      return undefined
    })
  }
  const service = new StoryProductionService(
    projects as never,
    productions as never,
    renders as never,
    logs as never,
    capabilities as never,
    queue as never
  )
  return {
    service,
    project,
    production,
    renders,
    logs,
    sandbox,
    artifacts,
    queue,
    getRender: () => renderRow
  }
}

describe('StoryProductionService rendering', () => {
  it('preserves server-owned Workspace media references on human saves', async () => {
    const harness = createHarness()
    const save = jest
      .spyOn(harness.service, 'saveProduction')
      .mockResolvedValue({
        success: true,
        duplicate: false,
        projectId: harness.project.id,
        revision: 4,
        production: { documentRevision: 2 }
      } as never)
    const currentScene = harness.production.scenes[0]
    await harness.service.saveProductionFromWorkbench(scope, {
      projectId: harness.project.id,
      operationId: 'human:production:0001',
      baseRevision: 3,
      production: {
        sourceSynopsis: harness.production.sourceSynopsis,
        adaptationGoal: harness.production.adaptationGoal,
        visualStyle: harness.production.visualStyle,
        audience: harness.production.audience,
        characters: harness.production.characters,
        scenes: [
          {
            ...currentScene,
            shots: currentScene.shots.map((shot) => ({
              ...shot,
              dialogueSpeakerId: 'lin',
              dialogueType: 'voice_over' as const,
              soundEffects: ['rain'],
              candidates: shot.candidates.map(
                (candidate): {
                  id: string
                  kind: 'image'
                  label: string
                  selected: boolean
                  fileUrl?: string
                  workspacePath?: string
                } => ({
                  id: candidate.id,
                  kind: candidate.kind as 'image',
                  label: 'Human-selected still',
                  selected: true
                })
              ).concat([
                {
                  id: 'untrusted-browser-candidate',
                  kind: 'image' as const,
                  label: 'Browser metadata only',
                  selected: false,
                  fileUrl: 'https://attacker.example/fake.png',
                  workspacePath: 'outside/scope/fake.png'
                }
              ])
            }))
          }
        ]
      },
      changeSummary: 'Human corrected the shot metadata'
    })

    const saved = save.mock.calls[0][1].production
    const candidate = saved.scenes[0].shots[0].candidates?.[0]
    expect(candidate).toEqual(
      expect.objectContaining({
        label: 'Human-selected still',
        fileReference: expect.objectContaining({
          source: 'platform.workspace.files',
          tenantId: 'tenant-a'
        }),
        mimeType: 'image/png',
        sha256: 'a'.repeat(64)
      })
    )
    expect(saved.scenes[0].shots[0]).toEqual(
      expect.objectContaining({
        dialogueSpeakerId: 'lin',
        dialogueType: 'voice_over',
        soundEffects: ['rain']
      })
    )
    expect(saved.scenes[0].shots[0].candidates?.[1]).toEqual({
      id: 'untrusted-browser-candidate',
      kind: 'image',
      label: 'Browser metadata only',
      selected: false
    })
  })

  it('enqueues only the render business id and persists the durable queued record', async () => {
    const harness = createHarness()
    const result = await harness.service.startRender(scope, {
      projectId: harness.project.id,
      operationId: 'render:memory:0001',
      expectedRevision: 3,
      quality: 'standard',
      fps: 24,
      fileName: 'memory-courier.mp4',
      changeSummary: 'Queued reviewed storyboard video'
    })

    expect(result.render.status).toBe('queued')
    expect(harness.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          renderId: '00000000-0000-4000-8000-000000000003',
          tenantId: 'tenant-a',
          organizationId: 'org-a',
          workspaceId: 'workspace-a',
          hostProjectId: 'host-project-a'
        },
        executionPool: 'sandbox-browser',
        attempts: 2
      })
    )
    expect(JSON.stringify(harness.queue.enqueue.mock.calls[0][0])).not.toContain(
      'compositionHtml'
    )
  })

  it('runs the immutable composition in Sandbox Jobs and persists the Workspace MP4', async () => {
    const harness = createHarness()
    await harness.service.startRender(scope, {
      projectId: harness.project.id,
      operationId: 'render:memory:0002',
      expectedRevision: 3,
      quality: 'draft',
      fps: 24,
      fileName: 'memory-courier.mp4',
      changeSummary: 'Queued draft storyboard video'
    })
    await harness.service.processRender({
      data: {
        renderId: '00000000-0000-4000-8000-000000000003',
        tenantId: 'tenant-a',
        organizationId: 'org-a',
        workspaceId: 'workspace-a',
        hostProjectId: 'host-project-a'
      },
      attemptsMade: 0,
      opts: { attempts: 2 }
    } as never)

    expect(harness.sandbox.run).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'story-studio.storyboard-render',
        actionVersion: '1.1.0',
        payload: expect.objectContaining({
          compositionHtml: expect.stringContaining(
            'src="media/camera-still/camera-still.png"'
          ),
          quality: 'draft',
          fps: 24
        }),
        files: [
          expect.objectContaining({
            targetPath: 'media/camera-still/camera-still.png',
            size: 2048,
            sha256: 'a'.repeat(64),
            access: 'read-only-seekable',
            reference: expect.objectContaining({
              source: 'platform.workspace.files',
              tenantId: 'tenant-a'
            })
          })
        ],
        outputs: expect.arrayContaining([
          expect.objectContaining({
            path: 'storyboard.mp4',
            mimeType: 'video/mp4'
          })
        ])
      })
    )
    expect(harness.getRender()).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        progress: 100,
        filePath: 'story-studio/project/render.mp4',
        checksum: 'video-checksum'
      })
    )
    expect(harness.artifacts.createArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'file',
        source: expect.objectContaining({
          resourceType: 'storyboard_video',
          resourceId: harness.project.id
        })
      })
    )
    expect(harness.artifacts.ensureArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: 'artifact-1',
        mimeType: 'application/octet-stream',
        sourceVersionId: '00000000-0000-4000-8000-000000000003'
      })
    )
    expect(harness.logs.save).toHaveBeenCalled()
  })

  it('fails a queue job when its durable render record cannot be resolved', async () => {
    const harness = createHarness()

    await expect(
      harness.service.processRender({
        data: {
          renderId: '00000000-0000-4000-8000-000000000099',
          tenantId: 'tenant-a',
          organizationId: 'org-a',
          workspaceId: 'workspace-a',
          hostProjectId: 'host-project-a'
        },
        attemptsMade: 0,
        opts: { attempts: 2 }
      } as never)
    ).rejects.toThrow('Queued Story Studio render was not found.')
    expect(harness.sandbox.run).not.toHaveBeenCalled()
  })

  it('keeps successful MP4 playback on the Workspace URL', async () => {
    const harness = createHarness()
    await harness.service.startRender(scope, {
      projectId: harness.project.id,
      operationId: 'render:memory:0003',
      expectedRevision: 3,
      quality: 'standard',
      fps: 24,
      fileName: 'memory-courier.mp4',
      changeSummary: 'Queued playback regression video'
    })
    await harness.service.processRender({
      data: {
        renderId: '00000000-0000-4000-8000-000000000003',
        tenantId: 'tenant-a',
        organizationId: 'org-a',
        workspaceId: 'workspace-a',
        hostProjectId: 'host-project-a'
      },
      attemptsMade: 0,
      opts: { attempts: 2 }
    } as never)

    const render = await harness.service.getRender(scope, {
      projectId: harness.project.id
    })

    expect(render).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        mimeType: 'video/mp4',
        fileUrl: 'http://localhost/files/render.mp4'
      })
    )
    expect(harness.artifacts.createSignedPreviewLink).not.toHaveBeenCalled()
  })
})
