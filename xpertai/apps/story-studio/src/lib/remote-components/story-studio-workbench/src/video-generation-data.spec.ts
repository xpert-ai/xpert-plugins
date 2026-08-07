import {
  hasUnhydratedCompletedVideoTask,
  parseVideoTaskList,
  type VideoGenerationTask
} from './video-generation-data'

function videoTask(
  overrides: Partial<VideoGenerationTask> = {}
): VideoGenerationTask {
  return {
    id: 'task-1',
    projectId: 'project-1',
    sceneId: 'scene-1',
    shotId: 'shot-1',
    requestGroupId: 'group-1',
    takeIndex: 1,
    generatorFamily: 'seedance',
    generatorName: 'Seedance 2.0',
    status: 'generating',
    stage: 'generating',
    progress: 42,
    resultCandidateId: null,
    failureCode: null,
    failureMessage: null,
    recoverable: false,
    upstreamMayContinue: false,
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:01:00.000Z',
    ...overrides
  }
}

describe('video generation data', () => {
  it('parses the lightweight task-list action payload', () => {
    expect(parseVideoTaskList({
      items: [{
        id: 'task-1',
        projectId: 'project-1',
        sceneId: 'scene-1',
        shotId: 'shot-1',
        requestGroupId: 'group-1',
        takeIndex: 1,
        generatorFamily: 'seedance',
        generatorName: 'Seedance 2.0',
        status: 'generating',
        stage: 'generating',
        progress: 42,
        resultCandidateId: null,
        failureCode: null,
        failureMessage: null,
        recoverable: false,
        upstreamMayContinue: false,
        createdAt: '2026-08-06T10:00:00.000Z',
        updatedAt: '2026-08-06T10:01:00.000Z'
      }],
      total: 1,
      page: 1,
      pageSize: 50
    })).toEqual([
      expect.objectContaining({
        id: 'task-1',
        status: 'generating',
        progress: 42,
        takeIndex: 1
      })
    ])
  })

  it('requests production hydration when a completed candidate is missing', () => {
    expect(hasUnhydratedCompletedVideoTask([
      videoTask({
        status: 'completed',
        stage: 'completed',
        progress: 100,
        resultCandidateId: 'candidate-1'
      })
    ], new Set())).toBe(true)
  })

  it('does not request production hydration for a known completed candidate', () => {
    expect(hasUnhydratedCompletedVideoTask([
      videoTask({
        status: 'completed',
        stage: 'completed',
        progress: 100,
        resultCandidateId: 'candidate-1'
      })
    ], new Set(['candidate-1']))).toBe(false)
  })

  it('does not request production hydration while generation is active', () => {
    expect(hasUnhydratedCompletedVideoTask([
      videoTask({ resultCandidateId: 'candidate-1' })
    ], new Set())).toBe(false)
  })
})
