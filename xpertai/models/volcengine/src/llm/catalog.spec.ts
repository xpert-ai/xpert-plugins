import { VolcengineProviderStrategy } from '../provider.strategy.js'
import { VolcengineLargeLanguageModel } from './llm.js'

describe('Doubao Mini lifecycle metadata', () => {
  it('retains the retired ID for saved references and keeps its replacement selectable', () => {
    const manager = new VolcengineLargeLanguageModel(new VolcengineProviderStrategy())
    expect(manager.getModelSchema('doubao-seed-2-0-mini-260215')).toMatchObject({
      model: 'doubao-seed-2-0-mini-260215', deprecated: true
    })
    const replacement = manager.getModelSchema('doubao-seed-2-0-mini-260428')
    expect(replacement?.model).toBe('doubao-seed-2-0-mini-260428')
    expect(replacement?.deprecated).not.toBe(true)
  })
})
