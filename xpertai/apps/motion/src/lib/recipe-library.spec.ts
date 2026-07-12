import { getMotionRecipeDetail, loadDesignSystemsCount, loadMotionRecipes, readMotionSpec, searchMotionRecipes } from './recipe-library.js'

describe('Motion recipe library', () => {
  it('loads upstream recipe and design-system indexes', () => {
    expect(readMotionSpec()).toContain('MOTION-SPEC')
    expect(loadDesignSystemsCount()).toBeGreaterThan(0)
    expect(loadMotionRecipes().length).toBeGreaterThan(20)
  })

  it('searches recipes by query and surface', () => {
    const result = searchMotionRecipes({ query: 'shiny', surface: 'web', pageSize: 10 })
    expect(result.total).toBeGreaterThan(0)
    expect(result.items.some((recipe) => recipe.id === 'shiny-text')).toBe(true)
  })

  it('returns recipe detail with implementation file names', () => {
    const detail = getMotionRecipeDetail('shiny-text')
    expect(detail.summary.name).toBe('Shiny Text')
    expect(detail.manifestText).toContain('shiny-text')
    expect(detail.implementationFiles.length).toBeGreaterThan(0)
  })
})
