import { MinerUTransformerStrategy } from './transformer-mineru.strategy.js'

describe('MinerU knowledgebase parser capability', () => {
  it('exposes the shared PDF/image formats, and validates supplied options', async () => {
    const strategy = new MinerUTransformerStrategy()
    expect(strategy.meta.supportedFileTypes).toEqual(['pdf', 'png', 'jpg', 'jpeg'])
    expect(strategy.meta.providesImageText).toBe(true)
    await expect(strategy.validateConfig({ stage: 'test' })).resolves.toBeUndefined()
    await expect(strategy.validateConfig({ stage: 'test', modelVersion: 'invalid' as 'vlm' })).rejects.toThrow('Unsupported MinerU model')
    await expect(strategy.validateConfig({ stage: 'test', isOcr: 'false' as never })).rejects.toThrow('Invalid MinerU option')
  })
})
