jest.mock('@xpert-ai/plugin-sdk', () => ({
  ImageUnderstandingStrategy: () => () => undefined
}))

import type { IImageUnderstandingStrategy } from '@xpert-ai/plugin-sdk'
import { PaddleOCRStrategy } from './paddle-ocr.strategy.js'

describe('PaddleOCRStrategy regression', () => {
  it('keeps the existing strategy name and validates its endpoint', async () => {
    const strategy = new PaddleOCRStrategy()
    expect(strategy.meta.name).toBe('paddle-ocr')
    await expect(strategy.validateConfig({ stage: 'test', apiUrl: '' })).rejects.toThrow(
      'requires `apiUrl`'
    )
  })

  it('returns OCR chunks for image assets', async () => {
    const strategy = new PaddleOCRStrategy()
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: 'recognized text' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const document: Parameters<IImageUnderstandingStrategy['understandImages']>[0] = {
      parserId: 'default',
      parserConfig: {},
      type: 'image',
      name: 'sample.png',
      filePath: 'sample.png',
      metadata: {
        assets: [{ type: 'image', filePath: 'images/sample.png', url: 'https://assets/sample.png' }]
      }
    }

    const result = await strategy.understandImages(document, {
      stage: 'test',
      apiUrl: 'https://ocr.example/parse',
      lang: 'ch'
    })

    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0].pageContent).toBe('recognized text')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ocr.example/parse',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ imagePath: 'images/sample.png', lang: 'ch' })
      })
    )
    fetchMock.mockRestore()
  })
})
