import {
  attachGeneratedAssetImageSchema,
  attachGeneratedVideoSchema,
  saveStoryProductionSchema
} from './story-production.schemas.js'

const production = {
  sourceSynopsis: 'A courier discovers a memory hidden inside a broken camera.',
  adaptationGoal: 'Build a tense, emotionally legible vertical short.',
  visualStyle: 'Neon rain, restrained camera movement, graphic silhouettes.',
  audience: 'Young adult science-fiction viewers.',
  characters: [
    {
      id: 'char-lin',
      name: 'Lin',
      role: 'Courier',
      visualDescription: 'Yellow raincoat and a weathered camera bag.',
      voiceReference: {
        url: 'https://media.example/lin-voice.mp3',
        label: 'Lin voice reference',
        license: 'CC0'
      }
    }
  ],
  scenes: [
    {
      id: 'scene-alley',
      order: 1,
      title: 'The delivery',
      summary: 'Lin finds the impossible recording.',
      location: 'Rain-soaked alley',
      shots: [
        {
          id: 'shot-camera',
          title: 'Camera wakes',
          composition: 'Close-up of the cracked camera in Lin’s hands.',
          action: 'The dead display flickers and shows Lin ten years older.',
          camera: 'Slow push-in',
          dialogue: 'Do not make the delivery.',
          dialogueSpeakerId: 'char-lin',
          dialogueType: 'dialogue',
          soundEffects: ['rain', 'camera static'],
          durationSeconds: 6,
          candidates: [
            {
              id: 'candidate-camera-a',
              kind: 'image',
              label: 'Selected camera close-up',
              selected: true
            }
          ]
        }
      ]
    }
  ]
}

describe('Story production schemas', () => {
  it('accepts a bounded production document', () => {
    const parsed = saveStoryProductionSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      operationId: 'production:story:0001',
      baseRevision: 2,
      production,
      changeSummary: 'Saved the reviewed one-scene production plan'
    })
    expect(parsed.production.scenes[0].shots[0].durationSeconds).toBe(6)
    expect(parsed.production.characters[0].voiceReference?.url).toContain(
      'lin-voice.mp3'
    )
  })

  it('rejects dialogue speakers that are not declared characters', () => {
    const invalid = structuredClone(production)
    invalid.scenes[0].shots[0].dialogueSpeakerId = 'char-missing'

    expect(() =>
      saveStoryProductionSchema.parse({
        projectId: '00000000-0000-4000-8000-000000000001',
        operationId: 'production:story:0003',
        baseRevision: 2,
        production: invalid,
        changeSummary: 'Invalid dialogue speaker'
      })
    ).toThrow('was not found in characters')
  })

  it('rejects duplicate shot ids', () => {
    const invalid = {
      ...production,
      scenes: [
        ...production.scenes,
        {
          ...production.scenes[0],
          id: 'scene-two',
          order: 2
        }
      ]
    }
    expect(() =>
      saveStoryProductionSchema.parse({
        projectId: '00000000-0000-4000-8000-000000000001',
        operationId: 'production:story:0002',
        baseRevision: 2,
        production: invalid,
        changeSummary: 'Invalid duplicate shots'
      })
    ).toThrow('Shot ids must be unique')
  })

  it('accepts a bounded Seedance Workspace attachment receipt', () => {
    const parsed = attachGeneratedVideoSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      operationId: 'seedance:attach:0001',
      baseRevision: 3,
      sceneId: 'scene-alley',
      shotId: 'shot-camera',
      candidateId: 'seedance-task-1',
      label: 'Seedance video',
      file: {
        workspacePath:
          '/workspace/files/seedream-aigc/videos/task-1.mp4',
        mimeType: 'video/mp4'
      },
      providerReceipt: {
        provider: 'seedream_aigc',
        taskId: 'task-1',
        model: 'doubao-seedance-2-0-fast-260128',
        status: 'succeeded'
      },
      select: true,
      changeSummary: 'Attached completed Seedance video'
    })
    expect(parsed.providerReceipt.provider).toBe('seedream_aigc')
  })

  it('accepts a completed Seedream asset-image attachment', () => {
    const parsed = attachGeneratedAssetImageSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      operationId: 'seedream:asset:0001',
      baseRevision: 4,
      assetId: 'asset-lin',
      candidateId: 'seedream-image-task-1',
      label: 'Lin continuity reference',
      file: {
        workspacePath:
          '/workspace/files/seedream-aigc/images/task-1.png'
      },
      providerReceipt: {
        provider: 'seedream_aigc',
        taskId: 'task-image-1',
        model: 'doubao-seedream-4-5-251128',
        status: 'completed'
      },
      select: true,
      changeSummary: 'Attached Lin asset reference'
    })
    expect(parsed.assetId).toBe('asset-lin')
  })
})
