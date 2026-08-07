jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import { StoryAdaptationSuggestionService } from './story-adaptation-suggestion.service.js'
import type { StoryScope } from './types.js'

describe('StoryAdaptationSuggestionService', () => {
  it('stores an Assistant suggestion in the revisioned production document', async () => {
    const production = summary()
    const productions = {
      getProduction: jest.fn().mockResolvedValue(production),
      saveProductionFromWorkbench: jest.fn().mockImplementation((_scope, input) => ({
        duplicate: false,
        revision: 8,
        production: { ...production, ...input.production, projectRevision: 8 }
      }))
    }
    const service = new StoryAdaptationSuggestionService(productions as never)
    const result = await service.create(scope(), {
      projectId: production.projectId,
      operationId: 'suggestion:rain:0001',
      baseRevision: 7,
      suggestionId: 'suggestion-rain',
      episodeId: 'episode-1',
      sceneId: 'scene-1',
      shotId: 'shot-1',
      originalText: '她停下。',
      suggestedText: '她收紧相机背带。',
      reason: '把抽象情绪转为可视动作。',
      changeSummary: '新增雨夜镜头改编建议'
    })

    const saved = productions.saveProductionFromWorkbench.mock.calls[0][1]
    const suggestion = saved.production.storyPlan.adaptationSuggestions[0]
    expect(suggestion.createdBy).toBe('assistant')
    expect(suggestion.status).toBe('pending')
    expect(result.revision).toBe(8)
    expect(result.changedSuggestionIds).toEqual(['suggestion-rain'])
  })

  it('never rewrites episode script when creating a suggestion', async () => {
    const production = summary()
    const originalScript = production.episodes[0].script
    const productions = {
      getProduction: jest.fn().mockResolvedValue(production),
      saveProductionFromWorkbench: jest.fn().mockImplementation((_scope, input) => ({ duplicate: false, revision: 8, production: { ...production, ...input.production, projectRevision: 8 } }))
    }
    const service = new StoryAdaptationSuggestionService(productions as never)
    await service.create(scope(), {
      projectId: production.projectId,
      operationId: 'suggestion:rain:0002',
      baseRevision: 7,
      suggestionId: 'suggestion-rain-2',
      episodeId: 'episode-1',
      originalText: '她停下。',
      suggestedText: '她收紧相机背带。',
      reason: '动作更可视。',
      changeSummary: '新增改编建议'
    })
    expect(productions.saveProductionFromWorkbench.mock.calls[0][1].production.episodes[0].script).toBe(originalScript)
  })
})

function scope(): StoryScope {
  return { tenantId: 'tenant-a', organizationId: 'org-a', workspaceId: 'workspace-a', hostProjectId: 'host-project-a', userId: 'user-a', assistantId: 'assistant-a' }
}

function summary() {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    projectRevision: 7,
    sourceSynopsis: '雨夜重逢',
    visualStyle: '电影级雨夜',
    adaptationGoal: '改编为竖屏短剧',
    sourceMaterials: [],
    storyPlan: { logline: '久别重逢', theme: '面对真相', tone: '克制', beats: [], adaptationSuggestions: [] },
    episodes: [{ id: 'episode-1', order: 1, title: '雨夜重逢', summary: '两人重逢', script: '她停下。', targetDurationSeconds: 60 }],
    assets: [],
    characters: [],
    scenes: [{ id: 'scene-1', episodeId: 'episode-1', order: 1, title: '影棚外', summary: '两人相见', location: '第七摄影棚', timeOfDay: '雨夜', shots: [{ id: 'shot-1', title: '中景对峙', composition: '中景双人', action: '她停下', camera: '缓慢推近', dialogue: null, dialogueSpeakerId: null, dialogueType: null, soundEffects: ['雨声'], generationPrompt: '电影级雨夜', emotion: '克制', lens: '35mm', lighting: '侧逆光', colorTone: '冷暖对比', weather: '雨夜', durationSeconds: 5, candidates: [] }] }],
    counts: { sources: 0, beats: 0, episodes: 1, assets: 0, characters: 0, scenes: 1, shots: 1, candidates: 0, selectedCandidates: 0 },
    totalDurationSeconds: 5,
    documentRevision: 1,
    updatedAt: '2026-08-06T08:00:00.000Z'
  }
}
