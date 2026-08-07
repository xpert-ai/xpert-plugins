import 'reflect-metadata'
jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import {
  StoryActionLog,
  StoryCutHandoff,
  StoryProduction,
  StoryProject
} from './entities/index.js'
import { StoryCutHandoffService } from './story-cut-handoff.service.js'
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
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

describe('StoryCutHandoffService', () => {
  it('freezes one selected Workspace MP4 per ordered shot', async () => {
    const harness = createHarness()
    const result = await harness.service.prepare(scope, {
      projectId: PROJECT_ID,
      operationId: 'prepare:story:0001',
      expectedRevision: 7,
      fps: 24,
      changeSummary: 'Prepared the reviewed Story media for Cut.'
    })

    expect(result).toMatchObject({
      success: true,
      duplicate: false,
      handoff: {
        projectId: PROJECT_ID,
        sourceRevision: 7,
        handoffRevision: 1,
        mode: 'create',
        status: 'ready',
        shotCount: 1,
        durationSeconds: 5,
        width: 720,
        height: 1280,
        fps: 24
      }
    })
    expect(harness.handoffs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          target: { mode: 'create', cutProjectId: null },
          shots: [
            expect.objectContaining({
              sceneId: 'scene-1',
              shotId: 'shot-1',
              startSeconds: 0,
              durationSeconds: 5,
              file: {
                workspacePath: 'story-studio/project/shot-1.mp4',
                originalName: 'shot-1.mp4',
                mimeType: 'video/mp4',
                size: 4096,
                sha256: 'a'.repeat(64)
              }
            })
          ]
        })
      })
    )
    expect(harness.logs.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cut_handoff_prepared' })
    )
  })

  it('uses the sole Workspace MP4 without requiring an explicit selection', async () => {
    const harness = createHarness(false, false)
    const result = await harness.service.prepare(scope, {
      projectId: PROJECT_ID,
      operationId: 'prepare:story:sole-video',
      expectedRevision: 7,
      fps: 24,
      changeSummary: 'Prepared the sole Story media candidate for Cut.'
    })

    expect(result.handoff).toMatchObject({ shotCount: 1, status: 'ready' })
  })

  it('rejects a shot with more than one selected video', async () => {
    const harness = createHarness(true)
    await expect(
      harness.service.prepare(scope, {
        projectId: PROJECT_ID,
        operationId: 'prepare:story:0002',
        expectedRevision: 7,
        changeSummary: 'Attempted ambiguous Cut handoff.'
      })
    ).rejects.toThrow('one unambiguous video')
    expect(harness.handoffs.save).not.toHaveBeenCalled()
  })
})

function createHarness(duplicateSelectedVideo = false, selected = true) {
  const project = {
    id: PROJECT_ID,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    hostProjectId: scope.hostProjectId,
    scopeKey: buildStoryScopeKey(scope),
    title: 'Arrival',
    premise: 'A traveler returns with a secret.',
    description: null,
    aspectRatio: '9:16',
    revision: 7
  }
  const candidate = {
    id: 'video-1',
    kind: 'video',
    label: 'Arrival',
    selected,
    originalName: 'shot-1.mp4',
    mimeType: 'video/mp4',
    size: 4096,
    sha256: 'a'.repeat(64),
    fileReference: {
      source: 'platform.workspace.files',
      filePath: 'story-studio/project/shot-1.mp4',
      workspacePath: 'story-studio/project/shot-1.mp4',
      tenantId: scope.tenantId,
      originalName: 'shot-1.mp4'
    }
  }
  const production = {
    projectId: PROJECT_ID,
    projectRevision: 7,
    adaptationGoal: 'A compact reversal.',
    visualStyle: 'Noir rain',
    scenes: [
      {
        id: 'scene-1',
        order: 1,
        title: 'Arrival',
        summary: 'The door opens.',
        shots: [
          {
            id: 'shot-1',
            title: 'Door',
            composition: 'Centered doorway',
            action: 'The door opens.',
            camera: 'Slow push',
            durationSeconds: 5,
            candidates: duplicateSelectedVideo
              ? [candidate, { ...candidate, id: 'video-2' }]
              : [candidate]
          }
        ]
      }
    ]
  }
  const projects = { findOne: jest.fn(async () => project) }
  const productions = { findOne: jest.fn(async () => production) }
  const handoffs = {
    findOne: jest.fn(async () => null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      ...value,
      createdAt: new Date('2026-07-26T00:00:00.000Z'),
      updatedAt: new Date('2026-07-26T00:00:00.000Z')
    }))
  }
  const logs = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value)
  }
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === StoryProject) return projects
      if (entity === StoryProduction) return productions
      if (entity === StoryCutHandoff) return handoffs
      if (entity === StoryActionLog) return logs
      throw new Error('Unexpected Story repository.')
    })
  }
  const rootProjects = {
    ...projects,
    manager: {
      transaction: jest.fn(async (callback) => callback(manager))
    }
  }
  return {
    service: new StoryCutHandoffService(
      rootProjects as never,
      productions as never,
      handoffs as never,
      logs as never
    ),
    handoffs,
    logs
  }
}
