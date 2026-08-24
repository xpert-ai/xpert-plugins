import {
  initializeStoryProductionSchema,
  updateStoryProductionBriefSchema,
  upsertStoryProductionAssetSchema,
  upsertStoryProductionCharacterSchema,
  upsertStoryProductionEpisodeSchema,
  upsertStoryProductionSceneMetadataSchema
} from './story-production-agent.schemas.js'

const projectId = '00000000-0000-4000-8000-000000000001'
const mutation = {
  projectId,
  operationId: 'production:bounded:001',
  baseRevision: 3,
  changeSummary: 'Applied one bounded production mutation'
}

describe('Story production Agent schemas', () => {
  it('initializes only the production brief', () => {
    const parsed = initializeStoryProductionSchema.parse({
      ...mutation,
      sourceSynopsis: 'A courier finds a recording from the future.',
      adaptationGoal: 'Create a tense vertical short.',
      visualStyle: 'Neon rain and restrained camera movement.'
    })

    expect(parsed.sourceSynopsis).toContain('courier')
    expect(() =>
      initializeStoryProductionSchema.parse({
        ...mutation,
        characters: [{ id: 'char-lin', name: 'Lin' }]
      })
    ).toThrow('Unrecognized key')
  })

  it('rejects nested shots from the scene metadata tool', () => {
    expect(() =>
      upsertStoryProductionSceneMetadataSchema.parse({
        ...mutation,
        scene: {
          id: 'scene-alley',
          order: 1,
          title: 'The alley',
          summary: 'Lin discovers the recording.',
          shots: [{ id: 'shot-camera' }]
        }
      })
    ).toThrow('Unrecognized key')
  })

  it('requires episode duration to be an integer number of seconds', () => {
    expect(() =>
      upsertStoryProductionEpisodeSchema.parse({
        ...mutation,
        episode: {
          id: 'episode-1',
          order: 1,
          title: 'The delivery',
          summary: 'Lin receives the impossible package.',
          script: 'EXT. ALLEY - NIGHT\nLin opens the package.',
          targetDurationSeconds: '120'
        }
      })
    ).toThrow()

    expect(
      upsertStoryProductionEpisodeSchema.parse({
        ...mutation,
        episode: {
          id: 'episode-1',
          order: 1,
          title: 'The delivery',
          summary: 'Lin receives the impossible package.',
          script: 'EXT. ALLEY - NIGHT\nLin opens the package.',
          targetDurationSeconds: 120
        }
      }).episode.targetDurationSeconds
    ).toBe(120)
  })

  it('requires JSON-safe typographic quotation marks in episode scripts', () => {
    expect(() =>
      upsertStoryProductionEpisodeSchema.parse({
        ...mutation,
        episode: {
          id: 'episode-1',
          order: 1,
          title: 'The rescue',
          summary: 'A child calls for help.',
          script: 'The child cries: "Help!"'
        }
      })
    ).toThrow('ASCII double quotation marks')

    expect(
      upsertStoryProductionEpisodeSchema.parse({
        ...mutation,
        episode: {
          id: 'episode-1',
          order: 1,
          title: 'The rescue',
          summary: 'A child calls for help.',
          script: 'The child cries: “Help!”'
        }
      }).episode.script
    ).toContain('“Help!”')
  })

  it('rejects unknown brief fields', () => {
    expect(() =>
      updateStoryProductionBriefSchema.parse({
        ...mutation,
        sourceSynopsis: 'A revised synopsis.',
        scenes: []
      })
    ).toThrow('Unrecognized key')
  })

  it('allows a new character asset without a predicted revision', () => {
    const parsed = upsertStoryProductionCharacterSchema.parse({
      projectId,
      operationId: 'production:character:lin:001',
      character: {
        id: 'char-lin',
        name: 'Lin',
        description: 'A courier in a yellow raincoat.',
        prompt: 'Cinematic identity reference for Lin.',
        role: 'lead'
      },
      changeSummary: 'Added Lin'
    })
    expect(parsed.baseRevision).toBeUndefined()
    expect(parsed.character.prompt).toContain('identity')
  })

  it('routes characters only through the character asset tool', () => {
    expect(() =>
      upsertStoryProductionAssetSchema.parse({
        ...mutation,
        asset: {
          id: 'char-lin',
          kind: 'character',
          name: 'Lin',
          description: 'A courier.',
          prompt: 'Lin identity reference.'
        }
      })
    ).toThrow()
  })
})
