import { BaiduPaddleOcrVlTransformerStrategy } from './paddleocr-vl-transformer.strategy.js'
import { BaiduOcrTransformService } from './transform.service.js'

describe('PaddleOCR-VL knowledgebase parser capability', () => {
  it('offers only PDF and image formats in knowledgebase parser selection', () => {
    const service = Object.assign(Object.create(BaiduOcrTransformService.prototype), { transform: jest.fn() })
    const strategy = new BaiduPaddleOcrVlTransformerStrategy(service)

    expect(strategy.meta.supportedFileTypes).toEqual(['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'tif', 'tiff'])
    expect(strategy.meta.providesImageText).toBe(true)
    expect(strategy.meta).toMatchObject({ configScope: 'integration', configSchema: { properties: {} } })
    expect(Object.keys(strategy.meta.configSchema.properties)).toEqual([])
  })

  it.each(['pdf', 'png'])('forwards %s documents and parser options to PaddleOCR-VL', async (type) => {
    const transform = jest.fn(async () => [])
    const service = Object.assign(Object.create(BaiduOcrTransformService.prototype), { transform })
    const strategy = new BaiduPaddleOcrVlTransformerStrategy(service)
    const config = { stage: 'test' as const, mergeTables: false, preserveImages: true }
    const documents = [{ name: `document.${type}`, type }]

    await strategy.validateConfig(config)
    await strategy.transformDocuments(documents, config)
    expect(transform).toHaveBeenCalledWith('paddleocr-vl', documents, config)
  })

  it('rejects invalid parser options', async () => {
    const service = Object.assign(Object.create(BaiduOcrTransformService.prototype), { transform: jest.fn() })
    const strategy = new BaiduPaddleOcrVlTransformerStrategy(service)

    await expect(strategy.validateConfig({ stage: 'test', mergeTables: 'false' as never })).rejects.toThrow('Invalid PaddleOCR-VL option')
  })
})
