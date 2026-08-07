import {
  buildSeedanceAssistantMessage,
  buildSeedanceGenerationTargets,
  buildSeedanceStatusAssistantMessage
} from './seedance-generation'
import type { ProductionView } from './production-data'

const production: ProductionView = {
  sourceSynopsis: 'A young woman discovers a hidden fortune.',
  visualStyle: '电影级古装喜剧写实',
  adaptationGoal: 'Build a short opening hook.',
  totalDurationSeconds: 10,
  sourceMaterials: [],
  storyPlan: null,
  episodes: [],
  assets: [],
  characters: [
    {
      id: 'character-hero',
      name: '苏锦鲤',
      role: '主角',
      visualDescription: null,
      voiceReference: {
        url: 'https://media.example/voice.mp3',
        label: 'Reference voice',
        license: 'Public domain',
        sourceUrl: null
      }
    }
  ],
  scenes: [
    {
      id: 'scene-one',
      episodeId: null,
      order: 1,
      title: '地窖',
      summary: 'The reveal.',
      location: '苏府地窖',
      timeOfDay: '清晨',
      shots: [
        {
          id: 'shot-one',
          title: '金山开局',
          composition: '人物站在门口。',
          action: '她看见堆满地窖的金银。',
          camera: '缓慢后拉',
          dialogue: '这得败到什么时候？',
          dialogueSpeakerId: 'character-hero',
          dialogueType: 'dialogue',
          soundEffects: ['木门声', '金属碰撞声'],
          generationPrompt: null,
          emotion: null,
          lens: null,
          lighting: null,
          colorTone: null,
          weather: null,
          durationSeconds: 5,
          candidates: [
            {
              id: 'image-one',
              kind: 'image',
              label: 'Storyboard image',
              selected: true,
              fileUrl: null,
              workspacePath: '/workspace/shot-one.png',
              originalName: null,
              size: null,
              sha256: null,
              prompt: null,
              providerReceipt: null
            }
          ]
        }
      ]
    }
  ],
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
  }
}

describe('Seedance synchronized-audio generation request', () => {
  it('binds a character voice URL to the exact dialogue shot', () => {
    const [target] = buildSeedanceGenerationTargets(production)

    expect(target).toEqual(
      expect.objectContaining({
        generationTool: 'seedance_multimodal_reference_to_video',
        referenceAudioUrl: 'https://media.example/voice.mp3'
      })
    )
    expect(target.prompt).toContain('苏锦鲤以自然普通话准确说')
    expect(target.prompt).toContain('说话时嘴唇动作与语音同步')
    expect(target.prompt).toContain('同期音效：木门声、金属碰撞声')
    expect(target.prompt.length).toBeLessThanOrEqual(500)
  })

  it('requires generated audio and keeps a non-silent fallback', () => {
    const targets = buildSeedanceGenerationTargets(production)
    const message = buildSeedanceAssistantMessage({
      projectId: 'project-1',
      revision: 7,
      aspectRatio: '9:16',
      targets
    })

    expect(message).toContain('generate_audio=true')
    expect(message).toContain('reference_audio_urls')
    expect(message).toContain('Never fall back to silent video')
    expect(message).not.toContain('generate_audio=false')
  })

  it('builds a status-only follow-up that cannot resubmit generation', () => {
    const message = buildSeedanceStatusAssistantMessage({
      projectId: 'project-1',
      revision: 8
    })

    expect(message).toContain('seedance_video_query')
    expect(message).toContain('Do not create or resubmit')
    expect(message).toContain('story_attach_generated_video')
    expect(message).toContain('currently observed revision is 8')
    expect(message).not.toContain('seedance_text_to_video')
    expect(message).not.toContain('seedance_image_to_video')
  })
})
