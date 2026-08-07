import type { ProductionView, Shot } from './production-data'
import {
  addShotDialogue,
  displayRequiredScriptText,
  insertScriptShot,
  removeScriptShot,
  removeShotDialogue,
  updateSceneScriptText,
  updateShotDialogueMetadata,
  updateShotScriptText,
  type StructuredScriptDefaults
} from './structured-script-model'

const defaults: StructuredScriptDefaults = {
  episodeScript: '场景标题\n动作描述',
  sceneTitle: '新场景',
  sceneSummary: '描述本场发生的关键叙事变化。',
  shotAction: '角色完成本场关键动作。'
}

describe('structured script model', () => {
  it('edits scene and shot copy while rebuilding the episode script', () => {
    const production = fixture()
    expect(updateSceneScriptText(production, 'scene-1', 'title', '雨夜站台', defaults)).toBe(true)
    expect(updateSceneScriptText(production, 'scene-1', 'summary', '两人隔雨相望。', defaults)).toBe(true)
    expect(updateShotScriptText(production, 'scene-1', 'shot-1', 'action', '林晚收紧相机背带。', defaults)).toBe(true)
    expect(production.episodes[0].script).toContain('雨夜站台')
    expect(production.episodes[0].script).toContain('林晚收紧相机背带。')
  })

  it('treats starter copy as a visual placeholder without persisting empty required fields', () => {
    const production = fixture()
    expect(displayRequiredScriptText(defaults.sceneTitle, defaults.sceneTitle)).toBe('')
    updateSceneScriptText(production, 'scene-1', 'title', '', defaults)
    updateShotScriptText(production, 'scene-1', 'shot-1', 'action', '', defaults)
    expect(production.scenes[0].title).toBe(defaults.sceneTitle)
    expect(production.scenes[0].shots[0].action).toBe(defaults.shotAction)
  })

  it('inserts and removes action blocks as real shots', () => {
    const production = fixture()
    expect(insertScriptShot(production, 'scene-1', 'shot-1', 'shot-2', shotDraft('第二镜'), defaults)).toBe(true)
    expect(production.scenes[0].shots.map((shot) => shot.id)).toEqual(['shot-1', 'shot-2'])
    expect(production.counts.shots).toBe(2)
    expect(removeScriptShot(production, 'scene-1', 'shot-2', defaults)).toBe(true)
    expect(production.counts.shots).toBe(1)
    expect(removeScriptShot(production, 'scene-1', 'shot-1', defaults)).toBe(false)
  })

  it('adds, changes, and removes a structured dialogue block', () => {
    const production = fixture()
    expect(addShotDialogue(production, 'scene-1', 'shot-1', 'voice_over', defaults)).toBe(true)
    updateShotScriptText(production, 'scene-1', 'shot-1', 'dialogue', '我终于回来了。', defaults)
    updateShotDialogueMetadata(production, 'scene-1', 'shot-1', { dialogueSpeakerId: 'character-1' }, defaults)
    expect(production.scenes[0].shots[0].dialogueType).toBe('voice_over')
    expect(production.episodes[0].script).toContain('林晚：')
    expect(removeShotDialogue(production, 'scene-1', 'shot-1', defaults)).toBe(true)
    expect(production.scenes[0].shots[0].dialogue).toBeNull()
  })
})

function shotDraft(title: string): Omit<Shot, 'id' | 'candidates'> {
  return {
    title,
    composition: '中景',
    action: defaults.shotAction,
    camera: '固定机位',
    dialogue: null,
    dialogueSpeakerId: null,
    dialogueType: null,
    soundEffects: [],
    generationPrompt: '电影感画面',
    emotion: null,
    lens: '35mm',
    lighting: null,
    colorTone: null,
    weather: null,
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
    storyPlan: null,
    episodes: [{ id: 'episode-1', order: 1, title: '第一集', summary: '两人重逢', script: defaults.episodeScript, targetDurationSeconds: 60 }],
    assets: [],
    characters: [{ id: 'character-1', name: '林晚', role: '主角', visualDescription: null, voiceReference: null }],
    scenes: [{ id: 'scene-1', episodeId: 'episode-1', order: 1, title: defaults.sceneTitle, summary: defaults.sceneSummary, location: '站台', timeOfDay: '雨夜', shots: [{ id: 'shot-1', ...shotDraft('第一镜'), candidates: [] }] }],
    counts: { sources: 0, beats: 0, episodes: 1, assets: 0, characters: 1, scenes: 1, shots: 1, candidates: 0, selectedCandidates: 0 }
  }
}
