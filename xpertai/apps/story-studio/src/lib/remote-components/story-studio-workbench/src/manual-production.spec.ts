import { createTranslator } from './i18n'
import { createManualStarterProduction } from './manual-production'
import type { ProjectSummary } from './project-data'

const project: ProjectSummary = {
  id: '00000000-0000-4000-8000-000000000099',
  title: '手工短剧',
  description: '不依赖 Assistant 的制作流程。',
  premise: '创作者从空白开始完成短剧。',
  productionFormat: 'vertical_short',
  aspectRatio: '9:16',
  targetDurationSeconds: 60,
  status: 'draft',
  revision: 1,
  tags: [],
  failureCode: null,
  failureMessage: null,
  failureRecoverable: null,
  updatedAt: null,
  nextAction: ''
}

describe('createManualStarterProduction', () => {
  it('creates a schema-ready production that can be edited without Assistant input', () => {
    const production = createManualStarterProduction(
      project,
      createTranslator('zh-Hans')
    )

    expect(production.sourceSynopsis).toBe(project.premise)
    expect(production.episodes).toHaveLength(1)
    expect(production.scenes).toHaveLength(1)
    expect(production.scenes[0].shots).toHaveLength(1)
    expect(production.scenes[0].episodeId).toBe(production.episodes[0].id)
    expect(production.totalDurationSeconds).toBe(5)
    expect(production.counts).toMatchObject({
      episodes: 1,
      scenes: 1,
      shots: 1,
      assets: 0
    })
  })
})
