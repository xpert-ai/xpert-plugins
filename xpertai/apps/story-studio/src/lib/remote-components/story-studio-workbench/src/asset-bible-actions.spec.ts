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
  negativePrompt: null,
  continuityNotes: null,
  categoryDetails: {
    identity: null,
    appearance: null,
    wardrobe: null,
    voice: null,
    environment: null,
    lighting: null,
    material: null,
    condition: null,
    storyFunction: null,
    palette: null,
    lens: null,
    continuity: null
  },
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
    expect(message).toContain('currentBaseRevision=7')
    expect(message).toContain('EXACTLY 4 separate image files')
    expect(message).toContain('Slot 1/4 — continuity_view:front')
    expect(message).toContain('Slot 4/4 — continuity_view:back')
    expect(message).toContain('{"assetReference":{"type":"continuity_view","key":"front"},"select":true,"replaceReference":true}')
    expect(message).toContain('{"assetReference":{"type":"continuity_view","key":"three_quarter"},"select":false,"replaceReference":true}')
    expect(message).toContain('{"assetReference":{"type":"continuity_view","key":"profile"},"select":false,"replaceReference":true}')
    expect(message).toContain('{"assetReference":{"type":"continuity_view","key":"back"},"select":false,"replaceReference":true}')
    expect(message.match(/"assetReference":/g)).toHaveLength(4)
    expect(message).toContain('never reuse an image or workspacePath')
    expect(message).toContain('do not parallelize attachment calls')
    expect(message).toContain('currentBaseRevision=receipt.revision')
    expect(message).toContain('error.currentRevision')
    expect(message).toContain('story_get_project_revision')
    expect(message).not.toContain(
      'Call story_get_project_summary immediately before'
    )
    expect(message).toContain('never a quoted or JSON-encoded string')
  })

  it('builds a separate expression reference request', () => {
    const message = buildAssetImageAssistantMessage({
      projectId: '00000000-0000-4000-8000-000000000001',
      revision: 8,
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
      },
      referenceSet: 'expressions'
    })

    expect(message).toContain('character expression reference set')
    expect(message).toContain('Slot 1/4 — expression:neutral')
    expect(message).toContain('Slot 4/4 — expression:angry')
    expect(message.match(/^Slot \d\/4 — expression:/gm)).toHaveLength(4)
    expect(message).toContain(
      'Call seedream_text_to_image exactly once for that slot'
    )
    expect(message).toContain(
      'Call story_attach_generated_asset_image once with baseRevision=currentBaseRevision'
    )
    expect(message).toContain('{"assetReference":{"type":"expression","key":"neutral"},"select":false,"replaceReference":true}')
    expect(message).toContain('{"assetReference":{"type":"expression","key":"happy"},"select":false,"replaceReference":true}')
    expect(message).toContain('{"assetReference":{"type":"expression","key":"sad"},"select":false,"replaceReference":true}')
    expect(message).toContain('{"assetReference":{"type":"expression","key":"angry"},"select":false,"replaceReference":true}')
    expect(message.match(/"assetReference":/g)).toHaveLength(4)
    expect(message).toContain('never a quoted or JSON-encoded string')
    expect(message).toContain('Keep camera angle and crop fixed')
  })
})
