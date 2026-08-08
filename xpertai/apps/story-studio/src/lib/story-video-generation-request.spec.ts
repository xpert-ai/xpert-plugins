jest.mock('@xpert-ai/plugin-sdk', () => ({}))

import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type { StoryAsset, StoryScene, StoryShot } from './production-types.js'
import { buildStoryVideoGenerationRequest } from './story-video-generation-request.js'

describe('buildStoryVideoGenerationRequest', () => {
  it('combines the latest shot script and every selected reference into the task snapshot', () => {
    const characterImage = fileReference('characters/pony.jpg')
    const locationImage = fileReference('locations/river.jpg')
    const temporaryImage = fileReference('shots/temporary.jpg')
    const character = asset('asset-pony', 'character', '小马', characterImage)
    character.categoryDetails = {
      identity: '棕色幼年小马',
      appearance: '大眼睛，棕色鬃毛',
      wardrobe: '背着装满麦子的麻袋'
    }
    const location = asset('asset-river', 'location', '小河', locationImage)
    location.categoryDetails = {
      environment: '乡间浅河和石桥',
      lighting: '明亮午后自然光'
    }
    const shot = storyShot(temporaryImage)
    const scene = storyScene(shot)

    const request = buildStoryVideoGenerationRequest(
      generationInput('保持儿童绘本质感'),
      {
        assets: [character, location],
        characters: [{
          id: 'character-pony',
          name: '小马',
          voiceReference: {
            url: 'https://media.example/pony-voice.mp3',
            label: '清亮少年音',
            license: 'CC-BY-4.0',
            sourceUrl: 'https://media.example/pony-voice'
          }
        }]
      },
      scene,
      shot
    )

    expect(request.userPrompt).toBe('保持儿童绘本质感')
    expect(request.prompt).toContain('补充要求：保持儿童绘本质感')
    expect(request.prompt).toContain('动作表演：小马背着麦袋欢快奔跑')
    expect(request.prompt).toContain('对白：小马：“妈妈，我出发了！”')
    expect(request.prompt).toContain('声线锚点：小马沿用音色参考“清亮少年音”')
    expect(request.prompt).toContain('自然发音并保持口型同步')
    expect(request.prompt).toContain('图片1为当前镜头画面')
    expect(request.prompt).toContain('图片2为角色“小马”')
    expect(request.prompt).toContain('图片3为场景“小河”')
    expect(request.prompt).toContain('参考一致性：小马')
    expect(request.prompt).toContain('小河')
    expect(request.prompt).toContain('构图运镜：全景，低角度跟拍，35mm')
    expect(Array.from(request.prompt).length).toBeLessThanOrEqual(500)
    expect(request.referenceAssetIds).toEqual(['asset-pony', 'asset-river'])
    expect(request.referenceImageCandidateIds).toEqual([
      'temporary-shot-reference',
      'asset-pony-image',
      'asset-river-image'
    ])
    expect(request.referenceImages).toEqual([
      temporaryImage,
      characterImage,
      locationImage
    ])
    expect(request.references).toEqual([
      { kind: 'image', purpose: 'reference', file: temporaryImage },
      { kind: 'image', purpose: 'reference', file: characterImage },
      { kind: 'image', purpose: 'reference', file: locationImage }
    ])
    expect(request.inputImage).toBeUndefined()
  })

  it('uses a selected asset image as the primary image when the shot has no temporary reference', () => {
    const selected = fileReference('characters/selected.jpg')
    const other = fileReference('characters/other.jpg')
    const character = asset('asset-pony', 'character', '小马', other)
    if (character.candidates?.[0]) character.candidates[0].selected = false
    character.candidates?.push({
      id: 'asset-pony-selected',
      kind: 'image',
      label: '锁定造型',
      selected: true,
      fileReference: selected
    })
    const shot = storyShot()
    const request = buildStoryVideoGenerationRequest(
      generationInput(''),
      { assets: [character], characters: [] },
      storyScene(shot),
      shot
    )

    expect(request.references).toEqual([
      { kind: 'image', purpose: 'reference', file: selected }
    ])
    expect(request.referenceImageCandidateIds).toEqual(['asset-pony-selected'])
    expect(request.prompt).toContain('动作表演')
    expect(request.prompt).toContain('对白')
  })

  it('uses the references visible in the generation action before inferred settings are saved', () => {
    const characterImage = fileReference('characters/pony-visible.jpg')
    const character = asset('asset-pony', 'character', '小马', characterImage)
    const shot = storyShot()
    shot.videoSettings = undefined
    const request = buildStoryVideoGenerationRequest(
      {
        ...generationInput('保持角色造型一致'),
        referenceAssetIds: ['asset-pony']
      },
      { assets: [character], characters: [] },
      storyScene(shot),
      shot
    )

    expect(request.referenceAssetIds).toEqual(['asset-pony'])
    expect(request.referenceImageCandidateIds).toEqual(['asset-pony-image'])
    expect(request.references).toEqual([
      { kind: 'image', purpose: 'reference', file: characterImage }
    ])
  })

  it('keeps the provider prompt within its supported limit', () => {
    const shot = storyShot()
    shot.action = '连续动作'.repeat(200)
    shot.dialogue = '很长的对白'.repeat(200)
    const request = buildStoryVideoGenerationRequest(
      generationInput('额外要求'.repeat(200)),
      { assets: [], characters: [{ id: 'character-pony', name: '小马' }] },
      storyScene(shot),
      shot
    )

    expect(Array.from(request.prompt).length).toBeLessThanOrEqual(500)
    expect(request.prompt).toContain('动作表演')
    expect(request.prompt).toContain('对白')
  })

  it('binds the adopted previous clip and structured states for a continuous action', () => {
    const previous = storyShot()
    previous.id = 'shot-previous'
    previous.title = '松鼠下树'
    previous.continuity = {
      transition: 'auto',
      endState: { summary: '松鼠已经落地，站在树根旁' }
    }
    const sourceVideo = { ...fileReference('shots/previous.mp4'), mimeType: 'video/mp4' }
    previous.candidates = [{
      id: 'previous-adopted-video',
      kind: 'video',
      label: '候选镜头 1',
      selected: true,
      size: 1024,
      sha256: 'a'.repeat(64),
      fileReference: sourceVideo
    }]
    const shot = storyShot()
    shot.id = 'shot-next'
    shot.continuity = {
      transition: 'continuous_action',
      startState: { summary: '松鼠从树根旁向小马跑去' }
    }
    const scene = { ...storyScene(shot), shots: [previous, shot] }

    const request = buildStoryVideoGenerationRequest(
      { ...generationInput(''), shotId: shot.id },
      { assets: [], characters: [], scenes: [scene] },
      scene,
      shot
    )

    expect(request.prompt).toContain('开场必须从上一镜头结束状态继续')
    expect(request.prompt).toContain('松鼠已经落地')
    expect(request.continuity).toMatchObject({
      fromShotId: previous.id,
      sourceCandidateId: 'previous-adopted-video',
      sourceVideo,
      sourceVideoSize: 1024,
      sourceVideoSha256: 'a'.repeat(64),
      strength: 'prompt_only',
      status: 'prompt_only'
    })
  })

  it('does not carry a previous frame across an explicit time jump', () => {
    const previous = storyShot()
    previous.id = 'shot-previous'
    previous.title = '夜晚'
    previous.candidates = [{
      id: 'previous-video', kind: 'video', label: '候选镜头 1', selected: true,
      size: 1024, sha256: 'b'.repeat(64), fileReference: fileReference('shots/previous.mp4')
    }]
    const shot = storyShot()
    shot.id = 'shot-next'
    shot.continuity = { transition: 'time_jump' }
    const scene = { ...storyScene(shot), shots: [previous, shot] }
    const request = buildStoryVideoGenerationRequest(
      { ...generationInput(''), shotId: shot.id },
      { scenes: [scene] },
      scene,
      shot
    )
    expect(request.continuity).toMatchObject({ status: 'not_required', strength: 'none' })
    expect(request.prompt).toContain('时间跳转')
  })
})

function generationInput(prompt: string) {
  return {
    projectId: '11111111-1111-4111-8111-111111111111',
    operationId: 'operation-generation-request-0001',
    sceneId: 'scene-1',
    shotId: 'shot-1',
    toolsetId: '22222222-2222-4222-8222-222222222222',
    takeCount: 1,
    prompt,
    model: 'seedance-model',
    resolution: '720p',
    aspectRatio: '9:16',
    fps: 24,
    durationSeconds: 6,
    generateAudio: true
  }
}

function storyScene(shot: StoryShot): StoryScene {
  return {
    id: 'scene-1',
    order: 1,
    title: '小马过河',
    summary: '小马从家中出发',
    location: '乡间小路',
    timeOfDay: '晴朗午后',
    shots: [shot]
  }
}

function storyShot(temporaryImage?: WorkspacePortableFileReference): StoryShot {
  return {
    id: 'shot-1',
    title: '小马出发',
    composition: '全景',
    action: '小马背着麦袋欢快奔跑',
    camera: '低角度跟拍',
    dialogue: '妈妈，我出发了！',
    dialogueSpeakerId: 'character-pony',
    dialogueType: 'dialogue',
    soundEffects: ['马蹄声', '鸟鸣'],
    emotion: '欢快',
    lens: '35mm',
    lighting: '温暖自然光',
    colorTone: '明亮',
    weather: '晴天',
    durationSeconds: 6,
    videoSettings: { referenceAssetIds: ['asset-pony', 'asset-river'] },
    candidates: temporaryImage ? [{
      id: 'temporary-shot-reference',
      kind: 'image',
      label: '临时镜头参考图',
      selected: true,
      fileReference: temporaryImage
    }] : []
  }
}

function asset(
  id: string,
  kind: StoryAsset['kind'],
  name: string,
  reference: WorkspacePortableFileReference
): StoryAsset {
  return {
    id,
    kind,
    name,
    description: `${name}的连续性参考`,
    prompt: `${name}参考图`,
    candidates: [{
      id: `${id}-image`,
      kind: 'image',
      label: '参考图',
      selected: true,
      fileReference: reference
    }]
  }
}

function fileReference(filePath: string): WorkspacePortableFileReference {
  return {
    source: 'platform.workspace.files',
    filePath,
    workspacePath: filePath,
    catalog: 'projects',
    scopeId: 'workspace-project-1',
    mimeType: 'image/jpeg'
  }
}
