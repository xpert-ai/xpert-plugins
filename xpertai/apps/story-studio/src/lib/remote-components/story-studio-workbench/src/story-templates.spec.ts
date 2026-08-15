import { storyProductionDocumentSchema } from '../../../../lib/story-production.schemas'
import { createTranslator } from './i18n'
import {
  STORY_TEMPLATES,
  templateShotCount,
  templateToProduction
} from './story-templates'
import {
  productionActionDocument
} from './production-data'
import type { ProjectSummary } from './project-data'

const project: ProjectSummary = {
  id: '00000000-0000-4000-8000-000000000123',
  title: '模板测试项目',
  description: '用于验证模板蓝图的项目。',
  premise: '创作者在一个受限空间里发现改变关系的线索。',
  productionFormat: 'vertical_short',
  aspectRatio: '9:16',
  targetDurationSeconds: null,
  status: 'draft',
  revision: 1,
  tags: [],
  failureCode: null,
  failureMessage: null,
  failureRecoverable: null,
  updatedAt: null,
  nextAction: ''
}

describe('story template blueprints', () => {
  it('produce a schema-ready editable production for every built-in template', () => {
    const t = createTranslator('zh-Hans')

    for (const template of STORY_TEMPLATES) {
      const production = templateToProduction(template, project, t)
      const document = productionActionDocument(production)
      const parsed = storyProductionDocumentSchema.safeParse(document)
      const shots = production.scenes.flatMap((scene) => scene.shots)

      expect(parsed.success).toBe(true)
      expect(production.episodes).toHaveLength(template.blueprint.episodes.length)
      expect(production.scenes.length).toBe(template.blueprint.scenes.length)
      expect(shots).toHaveLength(templateShotCount(template, project.targetDurationSeconds ?? template.duration))
      expect(new Set(shots.map((shot) => shot.action)).size).toBe(shots.length)
      expect(shots.every((shot) => shot.generationPrompt?.trim())).toBe(true)
      expect(shots.every((shot) => shot.videoSettings?.referenceAssetIds.length)).toBe(true)
      expect(shots.every((shot) => shot.videoSettings?.aspectRatio === project.aspectRatio)).toBe(true)
      expect(production.assets.length).toBe(template.blueprint.assets.length)
      expect(production.assets.every((asset) => asset.description.trim() && asset.prompt.trim())).toBe(true)
      expect(production.sourceMaterials).toHaveLength(1)
    }
  })

  it('creates a real three-episode starter for the episodic template', () => {
    const template = STORY_TEMPLATES.find((item) => item.id === 'unsent-letter')
    expect(template).toBeDefined()
    if (!template) return

    const production = templateToProduction(template, {
      ...project,
      targetDurationSeconds: template.duration
    }, createTranslator('zh-Hans'))

    expect(production.episodes).toHaveLength(3)
    expect(production.episodes.every((episode) => episode.targetDurationSeconds === 60)).toBe(true)
    expect(production.scenes.map((scene) => scene.episodeId)).toEqual(
      production.episodes.map((episode) => episode.id)
    )
  })

  it('keeps a very short edited series duration schema-safe', () => {
    const template = STORY_TEMPLATES.find((item) => item.id === 'unsent-letter')
    expect(template).toBeDefined()
    if (!template) return

    const production = templateToProduction(template, {
      ...project,
      targetDurationSeconds: 5
    }, createTranslator('zh-Hans'))
    const parsed = storyProductionDocumentSchema.safeParse(
      productionActionDocument(production)
    )

    expect(parsed.success).toBe(true)
    expect(production.totalDurationSeconds).toBe(5)
  })
})
