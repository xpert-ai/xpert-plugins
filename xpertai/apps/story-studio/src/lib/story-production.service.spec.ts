jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities'),
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

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
    sourceSynopsis:
      'A courier receives a warning from her future self.',
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
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value)
  }
  const service = new StoryProductionService(
    projects as never,
    productions as never,
    logs as never,
    { get: jest.fn() } as never
  )
  return { service, project, production }
}

describe('StoryProductionService', () => {
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
})
