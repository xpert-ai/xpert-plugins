jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities'),
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import { StoryProductionService } from './story-production.service.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryProductionDocument } from './production-types.js'
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
    sourceSynopsis:
      'A courier receives a warning from her future self.',
    adaptationGoal: 'A compact science-fiction reversal.',
    visualStyle: 'Neon rain and amber memory fragments.',
    audience: 'Young adult viewers.',
    characters: [{ id: 'lin', name: 'Lin' }],
    assets: [] as NonNullable<StoryProductionDocument['assets']>,
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
            dialogueSpeakerId: 'lin',
            dialogueType: 'dialogue',
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
                  filePath:
                    'story-studio/project/camera-still.png',
                  workspacePath:
                    'story-studio/project/camera-still.png',
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
  const projects = {
    findOne: jest.fn().mockResolvedValue(project)
  }
  const productions = {
    findOne: jest.fn().mockResolvedValue(production)
  }
  const logs = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value)
  }
  const workspaceFiles = {
    writeRuntimeBuffer: jest.fn()
  }
  const service = new StoryProductionService(
    projects as never,
    productions as never,
    logs as never,
    { get: jest.fn().mockReturnValue(workspaceFiles) } as never
  )
  return { service, project, production, workspaceFiles }
}

describe('StoryProductionService', () => {
  it('uploads a scoped voice-reference audio file for a character asset', async () => {
    const harness = createHarness()
    harness.production.assets = [
      {
        id: 'asset-lin',
        kind: 'character',
        name: 'Lin',
        description: 'Courier',
        prompt: 'Courier portrait',
        candidates: []
      }
    ]
    harness.workspaceFiles.writeRuntimeBuffer.mockResolvedValue({
      name: 'voice-reference-lin.wav',
      filePath: 'story-studio/project/voice-references/voice-reference-lin.wav',
      workspacePath: '/workspace/story-studio/project/voice-references/voice-reference-lin.wav',
      fileUrl: 'https://workspace.example/voice-reference-lin.wav',
      mimeType: 'audio/wav',
      size: 44,
      catalog: 'projects',
      scopeId: scope.hostProjectId,
      buffer: Buffer.alloc(44),
      reference: {
        source: 'platform.workspace.files',
        filePath: 'story-studio/project/voice-references/voice-reference-lin.wav',
        workspacePath: '/workspace/story-studio/project/voice-references/voice-reference-lin.wav',
        originalName: 'lin.wav',
        mimeType: 'audio/wav',
        size: 44
      }
    })
    const wav = Buffer.alloc(44)
    wav.write('RIFF', 0, 'ascii')
    wav.write('WAVE', 8, 'ascii')

    const result = await harness.service.uploadVoiceReferenceAudio(
      scope,
      {
        projectId: harness.project.id,
        assetId: 'asset-lin',
        referenceId: 'voice-reference-lin',
        label: 'Lin voice'
      },
      {
        buffer: wav,
        originalName: 'lin.wav',
        mimeType: 'audio/wav'
      }
    )

    expect(result.voiceReference).toEqual(
      expect.objectContaining({
        url: 'https://workspace.example/voice-reference-lin.wav',
        label: 'Lin voice',
        workspacePath: expect.stringContaining('voice-reference-lin.wav'),
        mimeType: 'audio/wav'
      })
    )
    expect(harness.workspaceFiles.writeRuntimeBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: expect.stringContaining('voice-references'),
        mimeType: 'audio/wav'
      })
    )
  })

  it('starts the first production document with one nested-dialogue scene', async () => {
    const harness = createHarness()
    const save = jest
      .spyOn(harness.service, 'saveProduction')
      .mockResolvedValue({
        success: true,
        duplicate: false,
        projectId: harness.project.id,
        revision: 4,
        production: {
          documentRevision: 1,
          counts: {
            sources: 1,
            beats: 0,
            episodes: 0,
            assets: 0,
            characters: 1,
            scenes: 1,
            shots: 1,
            candidates: 0,
            selectedCandidates: 0
          },
          totalDurationSeconds: 5
        }
      } as never)
    ;(harness.service as unknown as { productions: { findOne: jest.Mock } })
      .productions.findOne.mockResolvedValueOnce(null)

    const result = await harness.service.startProduction(scope, {
      projectId: harness.project.id,
      operationId: 'agent:production:start:0001',
      baseRevision: 3,
      sourceSynopsis: 'A foal learns to test the river.',
      adaptationGoal: 'Create a clear one-scene fable short.',
      visualStyle: 'Warm ink-wash storybook animation.',
      characters: [{ id: 'foal', name: 'Foal' }],
      firstScene: {
        id: 'river',
        order: 1,
        title: 'The river',
        summary: 'The foal asks whether the water is safe.',
        shots: [
          {
            id: 'ask',
            title: 'Foal asks',
            composition: 'Medium shot beside the river.',
            action: 'The foal looks across the current.',
            camera: 'Static medium shot',
            dialogue: {
              text: 'Can I cross this river?',
              speakerId: 'foal',
              type: 'dialogue'
            },
            durationSeconds: 5
          }
        ]
      },
      changeSummary: 'Started the river-crossing production plan'
    })

    const production = save.mock.calls[0][1].production
    expect(production.scenes[0].shots[0]).toEqual(
      expect.objectContaining({
        dialogue: 'Can I cross this river?',
        dialogueSpeakerId: 'foal',
        dialogueType: 'dialogue'
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        projectId: harness.project.id,
        revision: 4,
        documentRevision: 1,
        sceneId: 'river',
        shotIds: ['ask']
      })
    )
  })

  it('does not start production over an existing document', async () => {
    const harness = createHarness()

    await expect(
      harness.service.startProduction(scope, {
        projectId: harness.project.id,
        operationId: 'agent:production:start:0002',
        baseRevision: 3,
        sourceSynopsis: 'A replacement plan.',
        adaptationGoal: 'Replace the plan.',
        visualStyle: 'Replacement style.',
        characters: [{ id: 'lin', name: 'Lin' }],
        firstScene: {
          id: 'replacement',
          order: 1,
          title: 'Replacement',
          summary: 'Replacement summary.',
          shots: [
            {
              id: 'replacement-shot',
              title: 'Replacement shot',
              composition: 'Wide shot.',
              action: 'The plan changes.',
              camera: 'Locked wide.',
              durationSeconds: 5
            }
          ]
        },
        changeSummary: 'Attempted to replace the existing production'
      })
    ).rejects.toThrow('production plan already exists')
  })

  it('resolves a scoped media candidate through a host file-access grant', async () => {
    const harness = createHarness()

    await expect(
      harness.service.resolveMediaCandidateFile(
        scope,
        harness.project.id,
        'camera-still'
      )
    ).resolves.toEqual({
      reference: expect.objectContaining({
        source: 'platform.workspace.files',
        tenantId: 'tenant-a',
        filePath: 'story-studio/project/camera-still.png'
      }),
      fileName: 'camera-still.png',
      mimeType: 'image/png',
      size: 2048
    })
  })

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
              candidates: shot.candidates
                .map(
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
                )
                .concat([
                  {
                    id: 'untrusted-browser-candidate',
                    kind: 'image' as const,
                    label: 'Browser metadata only',
                    selected: false,
                    fileUrl:
                      'https://attacker.example/fake.png',
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
    const candidate =
      saved.scenes[0].shots[0].candidates?.[0]
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

  it('patches one shot while clearing dialogue speaker fields for silent action', async () => {
    const harness = createHarness()
    const save = jest
      .spyOn(harness.service, 'saveProduction')
      .mockResolvedValue({
        success: true,
        duplicate: false,
        projectId: harness.project.id,
        revision: 4,
        production: {
          documentRevision: 2,
          counts: {
            sources: 0,
            beats: 0,
            episodes: 0,
            assets: 0,
            characters: 1,
            scenes: 1,
            shots: 1,
            candidates: 1,
            selectedCandidates: 1
          },
          totalDurationSeconds: 6
        }
      } as never)

    const result = await harness.service.upsertShot(scope, {
      projectId: harness.project.id,
      operationId: 'agent:shot:patch:0001',
      baseRevision: 3,
      sceneId: 'delivery',
      shot: {
        id: 'camera',
        action: 'Lin lowers the camera and decides to wait.',
        dialogue: null
      },
      changeSummary: 'Turned the camera warning into a silent action beat'
    })

    const saved = save.mock.calls[0][1].production
    const shot = saved.scenes[0].shots[0]
    expect(shot).toEqual(
      expect.objectContaining({
        id: 'camera',
        action: 'Lin lowers the camera and decides to wait.'
      })
    )
    expect(shot).not.toHaveProperty('dialogue')
    expect(shot).not.toHaveProperty('dialogueSpeakerId')
    expect(shot).not.toHaveProperty('dialogueType')
    expect(shot.candidates?.[0]).toEqual(
      expect.objectContaining({ id: 'camera-still' })
    )
    expect(result).toEqual(
      expect.objectContaining({
        projectId: harness.project.id,
        revision: 4,
        documentRevision: 2,
        sceneId: 'delivery',
        shotId: 'camera'
      })
    )
  })

  it('attaches a temporary reference image only to the requested shot', async () => {
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
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

    await harness.service.attachShotReferenceImage(scope, {
      projectId: harness.project.id,
      operationId: 'shot-reference:upload:0001',
      baseRevision: 3,
      sceneId: 'delivery',
      shotId: 'camera',
      candidateId: 'camera-manual-reference',
      label: 'Manual camera composition',
      prompt: 'Keep this exact composition.',
      providerReceipt: {
        provider: 'manual_upload',
        taskId: 'shot-reference:upload:0001',
        status: 'completed'
      },
      changeSummary: 'Uploaded a temporary shot reference'
    }, {
      name: 'camera-manual-reference.png',
      filePath: 'story-studio/project/shot-references/camera-manual-reference.png',
      workspacePath: 'story-studio/project/shot-references/camera-manual-reference.png',
      fileUrl: '/api/files/camera-manual-reference.png',
      mimeType: 'image/png',
      size: png.length,
      catalog: 'outputs',
      buffer: png,
      reference: {
        source: 'platform.workspace.files',
        filePath: 'story-studio/project/shot-references/camera-manual-reference.png',
        workspacePath: 'story-studio/project/shot-references/camera-manual-reference.png',
        tenantId: scope.tenantId,
        originalName: 'camera-manual-reference.png',
        mimeType: 'image/png'
      }
    } as never)

    const savedShot = save.mock.calls[0][1].production.scenes[0].shots[0]
    expect(savedShot.candidates).toHaveLength(2)
    expect(savedShot.candidates?.[0]).toMatchObject({
      id: 'camera-still',
      selected: false
    })
    expect(savedShot.candidates?.[1]).toMatchObject({
      id: 'camera-manual-reference',
      kind: 'image',
      selected: true,
      fileUrl: '/api/files/camera-manual-reference.png',
      providerReceipt: { provider: 'manual_upload' }
    })
  })

  it('replaces the existing image in the same asset reference slot', async () => {
    const harness = createHarness()
    harness.production.assets = [{
      id: 'asset-lin',
      kind: 'character',
      name: 'Lin',
      description: 'Courier',
      prompt: 'Lin reference',
      candidates: [{
        id: 'lin-front-old',
        kind: 'image',
        label: 'Old front',
        selected: true,
        assetReference: { type: 'continuity_view', key: 'front' },
        fileReference: {
          source: 'platform.workspace.files',
          filePath: 'story-studio/project/lin-front-old.png',
          workspacePath: 'story-studio/project/lin-front-old.png'
        }
      }]
    }]
    const save = jest.spyOn(harness.service, 'saveProduction').mockResolvedValue({
      success: true,
      duplicate: false,
      projectId: harness.project.id,
      revision: 4,
      production: { documentRevision: 2 }
    } as never)
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

    await harness.service.attachAssetImage(scope, {
      projectId: harness.project.id,
      operationId: 'asset-reference:replace:0001',
      baseRevision: 3,
      assetId: 'asset-lin',
      candidateId: 'lin-front-new',
      label: 'New front',
      assetReference: { type: 'continuity_view', key: 'front' },
      providerReceipt: {
        provider: 'manual_upload',
        taskId: 'asset-reference:replace:0001',
        status: 'completed'
      },
      select: true,
      replaceReference: true,
      changeSummary: 'Replaced Lin front reference'
    }, {
      name: 'lin-front-new.png',
      filePath: 'story-studio/project/lin-front-new.png',
      workspacePath: 'story-studio/project/lin-front-new.png',
      fileUrl: '/api/files/lin-front-new.png',
      mimeType: 'image/png',
      size: png.length,
      buffer: png,
      reference: {
        source: 'platform.workspace.files',
        filePath: 'story-studio/project/lin-front-new.png',
        workspacePath: 'story-studio/project/lin-front-new.png',
        tenantId: scope.tenantId,
        originalName: 'lin-front-new.png',
        mimeType: 'image/png'
      }
    } as never)

    const candidates = save.mock.calls[0][1].production.assets?.[0].candidates
    expect(candidates).toHaveLength(1)
    expect(candidates?.[0]).toMatchObject({
      id: 'lin-front-new',
      selected: true,
      assetReference: { type: 'continuity_view', key: 'front' }
    })
  })
})
