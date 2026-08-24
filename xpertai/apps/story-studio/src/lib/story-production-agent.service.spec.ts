jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities'),
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import { ConflictException } from '@nestjs/common'
import { StoryProductionAgentService } from './story-production-agent.service.js'
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

function createHarness(options: { productionExists?: boolean } = {}) {
  const project = {
    id: '00000000-0000-4000-8000-000000000001',
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope),
    title: 'The Impossible Warning',
    targetDurationSeconds: 60,
    revision: 3
  }
  const production = {
    id: '00000000-0000-4000-8000-000000000002',
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope),
    projectId: project.id,
    projectRevision: 3,
    documentRevision: 2,
    sourceSynopsis: 'A courier receives an impossible warning.',
    adaptationGoal: 'Create a compact suspense short.',
    visualStyle: 'Rain-soaked cinematic realism.',
    audience: null,
    sourceMaterials: [],
    storyPlan: null,
    episodes: [],
    assets: [
      {
        id: 'lin',
        kind: 'character',
        name: 'Lin',
        description: 'A courier.',
        prompt: 'Cinematic courier identity reference.',
        candidates: []
      }
    ],
    scenes: [
      {
        id: 'alley',
        order: 1,
        title: 'The alley',
        summary: 'Lin discovers the warning.',
        location: 'Old city alley',
        shots: [
          {
            id: 'warning',
            title: 'The warning appears',
            composition: 'Close-up of the camera screen.',
            action: 'The screen flickers on.',
            camera: 'Slow push-in',
            durationSeconds: 5
          }
        ]
      }
    ],
    operationId: 'production:existing:0001',
    updatedAt: new Date('2026-08-13T00:00:00.000Z')
  }
  const projects = { findOne: jest.fn().mockResolvedValue(project) }
  const productions = {
    findOne: jest
      .fn()
      .mockResolvedValue(options.productionExists === false ? null : production)
  }
  const operationLogs = new Map<string, Record<string, unknown>>()
  const logs = {
    findOne: jest.fn(async ({ where }: { where: { operationId: string } }) =>
      operationLogs.get(where.operationId) ?? null
    )
  }
  const summary = () => {
    const shots = production.scenes.flatMap((scene) => scene.shots)
    const candidates = production.assets.flatMap((asset) => asset.candidates ?? [])
    return {
      ...production,
      projectRevision: project.revision,
      counts: {
        sources: production.sourceMaterials.length,
        beats: 0,
        episodes: production.episodes.length,
        assets: production.assets.length,
        characters: production.assets.filter((asset) => asset.kind === 'character').length,
        scenes: production.scenes.length,
        shots: shots.length,
        candidates: candidates.length,
        selectedCandidates: 0
      },
      totalDurationSeconds: shots.reduce(
        (total, shot) => total + shot.durationSeconds,
        0
      ),
      updatedAt: production.updatedAt.toISOString()
    }
  }
  const saveProduction = jest.fn(async (_scope, input) => {
    if (input.baseRevision !== project.revision) {
      throw new ConflictException({
        errorCode: 'story_revision_conflict',
        currentRevision: project.revision
      })
    }
    const previousRevision = project.revision
    project.revision += 1
    Object.assign(production, input.production, {
      projectRevision: project.revision,
      documentRevision: production.documentRevision + 1,
      operationId: input.operationId
    })
    operationLogs.set(input.operationId, {
      projectId: project.id,
      operationId: input.operationId,
      operationFingerprint: input.operationFingerprint,
      previousRevision,
      resultingRevision: project.revision
    })
    return {
      success: true,
      duplicate: false,
      projectId: project.id,
      revision: project.revision,
      production: summary()
    }
  })
  const getProduction = jest.fn(async () => summary())
  const service = new StoryProductionAgentService(
    projects as never,
    productions as never,
    logs as never,
    { saveProduction, getProduction } as never
  )
  return { service, project, production, saveProduction, operationLogs }
}

describe('StoryProductionAgentService', () => {
  it('returns a compact production context without full business text', async () => {
    const harness = createHarness()
    const result = await harness.service.getContext(scope, {
      projectId: harness.project.id,
      expectedRevision: 3
    })

    expect(result).toEqual(
      expect.objectContaining({
        projectId: harness.project.id,
        revision: 3,
        exists: true,
        indexes: {
          characterIds: ['lin'],
          episodeIds: [],
          assetIds: ['lin'],
          scenes: [{ id: 'alley', shotIds: ['warning'] }]
        }
      })
    )
    expect(JSON.stringify(result)).not.toContain('impossible warning')
  })

  it('initializes a draft with one deterministic first episode', async () => {
    const harness = createHarness({ productionExists: false })
    const result = await harness.service.initialize(scope, {
      projectId: harness.project.id,
      operationId: 'production:initialize:0001',
      baseRevision: 3,
      sourceSynopsis: 'A courier receives an impossible warning.',
      adaptationGoal: 'Create a compact suspense short.',
      visualStyle: 'Rain-soaked cinematic realism.',
      changeSummary: 'Initialized the production brief'
    })

    expect(harness.saveProduction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({
        production: expect.objectContaining({
          episodes: [
            {
              id: 'episode-1',
              order: 1,
              title: 'The Impossible Warning',
              summary: 'A courier receives an impossible warning.',
              script: 'A courier receives an impossible warning.',
              targetDurationSeconds: 60
            }
          ],
          assets: [],
          scenes: []
        })
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        revision: 4,
        changedEntityType: 'production',
        changedEntityId: 'episode-1',
        nextAction: expect.stringContaining('episode-1')
      })
    )
  })

  it('returns a structured continuation when a draft already exists', async () => {
    const harness = createHarness()
    const request = harness.service.initialize(scope, {
      projectId: harness.project.id,
      operationId: 'production:initialize:replacement',
      baseRevision: 3,
      sourceSynopsis: 'A replacement synopsis.',
      adaptationGoal: 'Replace the existing production.',
      visualStyle: 'Replacement style.',
      changeSummary: 'Attempted to initialize a second production draft'
    })

    await expect(request).rejects.toBeInstanceOf(ConflictException)
    await expect(request).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: 'story_production_already_exists',
        currentRevision: 3,
        nextAction: 'story_get_production_context',
        availableMutations: expect.arrayContaining([
          'story_update_production_brief',
          'story_upsert_production_shot'
        ])
      })
    })
  })

  it('updates scene metadata without resubmitting or deleting its shots', async () => {
    const harness = createHarness()
    await harness.service.upsertSceneMetadata(scope, {
      projectId: harness.project.id,
      operationId: 'production:scene:metadata:0001',
      baseRevision: 3,
      scene: {
        id: 'alley',
        order: 1,
        title: 'Rainy alley',
        summary: 'Lin discovers the warning in the rain.',
        timeOfDay: 'night'
      },
      changeSummary: 'Updated the rainy alley scene header'
    })

    const saved = harness.saveProduction.mock.calls[0][1].production
    expect(saved.scenes[0]).toEqual(
      expect.objectContaining({
        id: 'alley',
        title: 'Rainy alley',
        location: 'Old city alley',
        shots: harness.production.scenes[0].shots
      })
    )
  })

  it('returns bounded validation diagnostics for an incomplete draft', async () => {
    const harness = createHarness()
    harness.production.scenes = []
    const result = await harness.service.validate(scope, {
      projectId: harness.project.id,
      expectedRevision: 3
    })

    expect(result).toEqual(
      expect.objectContaining({
        ready: false,
        issueCount: expect.any(Number),
        nextAction: expect.stringContaining('bounded')
      })
    )
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.length).toBeLessThanOrEqual(40)
  })

  it('serializes parallel character creates and safely rebases every distinct id', async () => {
    const harness = createHarness()
    const inputs = ['pig-one', 'pig-two', 'pig-three', 'wolf'].map(
      (id, index) => ({
        projectId: harness.project.id,
        operationId: `production:character:${id}:0001`,
        baseRevision: 3,
        character: {
          id,
          name: id,
          description: `Character ${id}`,
          prompt: `Generate consistent character ${id}`,
          role: index === 3 ? 'antagonist' : 'protagonist'
        },
        changeSummary: `Added ${id}`
      })
    )

    const receipts = await Promise.all(
      inputs.map((input) => harness.service.upsertCharacter(scope, input))
    )

    expect(harness.production.assets.filter((asset) => asset.kind === 'character'))
      .toHaveLength(5)
    expect(harness.project.revision).toBe(7)
    expect(receipts.map((receipt) => receipt.revision)).toEqual([4, 5, 6, 7])
    expect(receipts.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rebasedFromRevision: 3 })
      ])
    )
  })

  it('stores character identity and generation fields in the same asset aggregate', async () => {
    const harness = createHarness()
    await harness.service.upsertCharacter(scope, {
      projectId: harness.project.id,
      operationId: 'production:character:mei:0001',
      character: {
        id: 'mei',
        name: 'Mei',
        description: 'A forensic photographer.',
        prompt: 'Mei identity reference, cinematic realism.',
        role: 'lead',
        visualDescription: 'Short black hair and a charcoal coat.'
      },
      changeSummary: 'Added Mei'
    })

    expect(harness.production.assets).toContainEqual(
      expect.objectContaining({
        id: 'mei',
        kind: 'character',
        role: 'lead',
        prompt: expect.stringContaining('identity reference')
      })
    )
    expect(harness.production).not.toHaveProperty('characters')
  })

  it('requires an exact revision when updating an existing character asset', async () => {
    const harness = createHarness()
    await expect(
      harness.service.upsertCharacter(scope, {
        projectId: harness.project.id,
        operationId: 'production:character:lin:update',
        character: {
          id: 'lin',
          name: 'Lin',
          description: 'An updated courier.',
          prompt: 'Updated Lin identity reference.'
        },
        changeSummary: 'Updated Lin'
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: 'story_revision_conflict',
        currentRevision: 3
      })
    })
  })
})
