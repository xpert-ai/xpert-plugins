import type { StoryAsset, StoryScene } from './production-types.js'
import { sanitizeAssets, sanitizeScenes } from './story-production-media.js'

describe('Story production media sanitization', () => {
  it('keeps detailed asset fields while removing server-only file references', () => {
    const asset: StoryAsset = {
      id: 'asset-camera',
      kind: 'prop',
      name: '旧相机',
      description: '贯穿全剧的关键道具。',
      prompt: '磨损金属机身与旧皮革背带。',
      negativePrompt: '文字水印',
      continuityNotes: '破损位置保持一致。',
      categoryDetails: {
        material: '磨损金属 / 旧皮革',
        condition: '旧但可用',
        storyFunction: '关键证据',
        continuity: '持有人和朝向连续。'
      },
      candidates: [
        {
          id: 'camera-reference',
          kind: 'image',
          label: '旧相机参考',
          workspacePath: 'projects/demo/camera.png',
          fileReference: {
            source: 'platform.workspace.files',
            filePath: 'camera.png',
            workspacePath: 'projects/demo/camera.png'
          }
        }
      ]
    }

    const [sanitized] = sanitizeAssets([asset])

    expect(sanitized).toMatchObject({
      negativePrompt: '文字水印',
      continuityNotes: '破损位置保持一致。',
      categoryDetails: {
        material: '磨损金属 / 旧皮革',
        condition: '旧但可用',
        storyFunction: '关键证据'
      }
    })
    expect(sanitized.candidates?.[0]).not.toHaveProperty('fileReference')
  })

  it('keeps episode and generation metadata on scenes and shots', () => {
    const scene: StoryScene = {
      id: 'scene-rain',
      episodeId: 'episode-01',
      order: 1,
      title: '雨夜重逢',
      summary: '两人在旧影棚外重逢。',
      location: '旧影棚外',
      timeOfDay: '雨夜',
      shots: [
        {
          id: 'shot-s12',
          title: '隔雨相望',
          composition: '中景双人',
          action: '隔雨相望',
          camera: '轻微推近',
          generationPrompt: '冷蓝雨夜，暖色逆光。',
          emotion: '克制、试探',
          lens: '35mm',
          lighting: '冷蓝环境光 / 暖色逆光',
          colorTone: '低饱和冷暖对比',
          weather: '夜雨',
          durationSeconds: 7
        }
      ]
    }

    const [sanitized] = sanitizeScenes([scene])

    expect(sanitized.episodeId).toBe('episode-01')
    expect(sanitized.shots[0]).toMatchObject({
      generationPrompt: '冷蓝雨夜，暖色逆光。',
      emotion: '克制、试探',
      lens: '35mm',
      lighting: '冷蓝环境光 / 暖色逆光',
      colorTone: '低饱和冷暖对比',
      weather: '夜雨'
    })
  })
})
