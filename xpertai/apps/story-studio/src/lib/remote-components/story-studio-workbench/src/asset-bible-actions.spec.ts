import {
  assetImageGenerationSize,
  buildAssetImageAssistantMessage
} from './asset-bible-actions'

const asset = {
  id: 'asset-lin',
  kind: 'character' as const,
  name: 'Lin',
  description: 'A courier in a yellow raincoat.',
  prompt: 'Full-body cinematic character reference.',
  candidates: []
}

describe('asset bible actions', () => {
  it('uses aspect-aware generation sizes', () => {
    expect(assetImageGenerationSize('character')).toBe('1728x2304')
    expect(assetImageGenerationSize('location')).toBe('2560x1440')
    expect(assetImageGenerationSize('prop')).toBe('2048x2048')
  })

  it('builds a revision-safe Seedream attachment request', () => {
    const message = buildAssetImageAssistantMessage({
      projectId: '00000000-0000-4000-8000-000000000001',
      revision: 7,
      asset,
      production: {
        sourceSynopsis: 'A courier finds a forbidden recording.',
        visualStyle: 'Neon rain and restrained camera movement.',
        adaptationGoal: 'Create a vertical short.',
        totalDurationSeconds: 12,
        sourceMaterials: [],
        storyPlan: null,
        episodes: [],
        assets: [asset],
        characters: [],
        scenes: [],
        counts: {
          sources: 0,
          beats: 0,
          episodes: 0,
          assets: 1,
          characters: 0,
          scenes: 0,
          shots: 0,
          candidates: 0,
          selectedCandidates: 0
        }
      }
    })

    expect(message).toContain('seedream_text_to_image')
    expect(message).toContain('story_attach_generated_asset_image')
    expect(message).toContain('asset-lin')
    expect(message).toContain('1728x2304')
    expect(message).toContain('revision is 7')
  })
})
