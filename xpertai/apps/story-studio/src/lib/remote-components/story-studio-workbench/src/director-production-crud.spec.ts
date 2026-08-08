import {
  acceptAdaptationSuggestion,
  addAsset,
  addEpisode,
  addScene,
  addShot,
  createEmptyAssetDetails,
  deleteAsset,
  deleteEpisode,
  deleteScene,
  deleteShot,
  updateAsset,
  updateEpisode,
  updateScene,
  updateShot
} from './director-production-crud'
import type { ProductionView, Shot } from './production-data'

describe('director production CRUD', () => {
  it('creates, edits, and deletes episodes while preserving scene ownership', () => {
    const production = fixture()
    addEpisode(production, 'episode-2', {
      title: '新集', summary: '新集概要', script: '新集剧本', targetDurationSeconds: 60
    })
    expect(updateEpisode(production, 'episode-2', {
      title: '新集修订', summary: '修订概要', script: '修订剧本', targetDurationSeconds: 75
    })).toBe(true)
    production.scenes[0].episodeId = 'episode-2'
    expect(deleteEpisode(production, 'episode-2')).toBe(true)
    expect(production.scenes[0].episodeId).toBe('episode-1')
    expect(production.episodes.map((item) => item.order)).toEqual([1])
  })

  it('creates, edits, and safely deletes scenes and shots', () => {
    const production = fixture()
    addScene(production, 'scene-2', 'shot-2a', {
      episodeId: 'episode-1', title: '雨夜入口', summary: '两人进入影棚', location: '影棚门口', timeOfDay: '雨夜'
    }, shotDraft('建立镜头'))
    expect(updateScene(production, 'scene-2', {
      episodeId: 'episode-1', title: '雨夜走廊', summary: '两人继续试探', location: '影棚走廊', timeOfDay: '深夜'
    })).toBe(true)
    expect(addShot(production, 'scene-2', 'shot-2b', shotDraft('跟拍镜头'))).toBe(true)
    expect(updateShot(production, 'scene-2', 'shot-2b', { ...shotDraft('特写镜头'), durationSeconds: 7 })).toBe(true)
    expect(deleteShot(production, 'scene-2', 'shot-2b')).toBe(true)
    expect(deleteShot(production, 'scene-2', 'shot-2a')).toBe(false)
    expect(deleteScene(production, 'scene-2')).toBe(true)
    expect(deleteScene(production, 'scene-1')).toBe(false)
  })

  it.each(['character', 'location', 'prop', 'style'] as const)('creates, edits, and deletes a %s asset with detailed fields', (kind) => {
    const production = fixture()
    const details = createEmptyAssetDetails()
    details.continuity = `${kind} continuity`
    if (kind === 'character') details.appearance = '肩长黑发，右眼下浅痣'
    const voiceReference =
      kind === 'character'
        ? {
            url: 'https://media.example/voice.wav',
            label: '清透女声',
            license: 'CC-BY-4.0',
            sourceUrl: 'https://media.example/source'
          }
        : null
    if (kind === 'location') details.environment = '第七摄影棚外，湿地反光'
    if (kind === 'prop') details.material = '磨损黑色金属'
    if (kind === 'style') details.palette = '#18232F / #C58B55'
    addAsset(production, `asset-${kind}`, `character-${kind}`, {
      kind,
      name: `${kind} asset`,
      description: `${kind} description`,
      prompt: `${kind} prompt`,
      negativePrompt: 'watermark',
      continuityNotes: `${kind} continuity`,
      categoryDetails: details,
      role: kind === 'character' ? '主角' : undefined,
      voiceReference: kind === 'character' ? voiceReference : undefined
    })
    if (kind === 'character') {
      expect(production.characters[0].voiceReference).toEqual(voiceReference)
    }
    expect(updateAsset(production, `asset-${kind}`, {
      kind,
      name: `${kind} asset v2`,
      description: `${kind} description v2`,
      prompt: `${kind} prompt v2`,
      negativePrompt: 'watermark, duplicate',
      continuityNotes: `${kind} continuity v2`,
      categoryDetails: { ...details, continuity: `${kind} continuity v2` },
      role: kind === 'character' ? '主角' : undefined,
      voiceReference: kind === 'character'
        ? {
            ...voiceReference!,
            label: '更清透的女声'
          }
        : undefined
    })).toBe(true)
    if (kind === 'character') {
      expect(production.characters[0].voiceReference?.label).toBe('更清透的女声')
    }
    expect(deleteAsset(production, `asset-${kind}`)).toBe(true)
  })

  it('accepts an Assistant suggestion only after explicit user action', () => {
    const production = fixture()
    expect(acceptAdaptationSuggestion(production, 'suggestion-1')).toBe(true)
    expect(production.episodes[0].script).toContain('她收紧相机背带。')
    expect(production.storyPlan?.adaptationSuggestions[0].status).toBe('accepted')
  })
})

function shotDraft(title: string): Omit<Shot, 'id' | 'candidates'> {
  return {
    title,
    composition: '中景双人',
    action: '人物停下',
    camera: '缓慢推近',
    dialogue: null,
    dialogueSpeakerId: null,
    dialogueType: null,
    soundEffects: ['雨声'],
    generationPrompt: '电影级雨夜',
    emotion: '克制',
    lens: '35mm',
    lighting: '侧逆光',
    colorTone: '冷暖对比',
    weather: '雨夜',
    durationSeconds: 5
  }
}

function fixture(): ProductionView {
  return {
    sourceSynopsis: '雨夜重逢',
    visualStyle: '电影级雨夜',
    adaptationGoal: '改编为竖屏短剧',
    totalDurationSeconds: 5,
    sourceMaterials: [],
    storyPlan: {
      logline: '久别重逢',
      theme: '面对真相',
      tone: '克制',
      beats: [],
      adaptationSuggestions: [{
        id: 'suggestion-1', episodeId: 'episode-1', sceneId: 'scene-1', shotId: 'shot-1', originalText: '她停下。', suggestedText: '她收紧相机背带。', reason: '动作更可视', status: 'pending', createdBy: 'assistant', createdAt: '2026-08-06T08:00:00.000Z'
      }]
    },
    episodes: [{ id: 'episode-1', order: 1, title: '雨夜重逢', summary: '两人重逢', script: '她停下。', targetDurationSeconds: 60 }],
    assets: [],
    characters: [],
    scenes: [{ id: 'scene-1', episodeId: 'episode-1', order: 1, title: '影棚外', summary: '两人相见', location: '第七摄影棚', timeOfDay: '雨夜', shots: [{ id: 'shot-1', ...shotDraft('建立镜头'), candidates: [] }] }],
    counts: { sources: 0, beats: 0, episodes: 1, assets: 0, characters: 0, scenes: 1, shots: 1, candidates: 0, selectedCandidates: 0 }
  }
}
