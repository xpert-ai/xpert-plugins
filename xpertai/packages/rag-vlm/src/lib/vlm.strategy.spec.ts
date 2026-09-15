jest.mock('@xpert-ai/plugin-sdk', () => ({ ImageUnderstandingStrategy: () => (target: object) => target }))
jest.mock('@xpert-ai/contracts', () => ({
  buildChunkTree: (chunks: { metadata: { parentId?: string } }[]) => chunks,
  collectTreeLeaves: (chunks: { metadata: { chunkId: string; parentId?: string } }[]) =>
    chunks.filter((chunk) => !chunks.some((child) => child.metadata.parentId === chunk.metadata.chunkId))
}))
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { TImageUnderstandingConfig, XpFileSystem } from '@xpert-ai/plugin-sdk'
import sharp from 'sharp'
import { VlmDefaultStrategy } from './vlm.strategy.js'

async function fixture(pdf = true) {
  const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: 'white' } })
    .png()
    .toBuffer()
  const invoke = jest.fn(async () => ({
    content: [{ type: 'text', text: 'PAGE2-SCAN-862\n| code | count |\n| --- | --- |\n| 0007 | 0 |' }]
  }))
  const config: TImageUnderstandingConfig = {
    stage: 'test',
    visionModel: { invoke } as unknown as BaseChatModel,
    permissions: { fileSystem: { readFile: async () => image } as unknown as XpFileSystem }
  }
  const doc = {
    metadata: {
      assets: [
        {
          type: 'image',
          filePath: 'page2.png',
          url: 'https://files.test/page2.png',
          page: 2,
          ...(pdf ? { sourceType: 'pdf_page' } : {})
        }
      ]
    },
    chunks: [
      { pageContent: 'context parent', metadata: { chunkId: 'parent' } },
      { pageContent: '![page](https://files.test/page2.png)', metadata: { chunkId: 'leaf', parentId: 'parent' } },
      { pageContent: 'overlap ![page](https://files.test/page2.png)', metadata: { chunkId: 'overlap' } }
    ]
  } as Parameters<VlmDefaultStrategy['understandImages']>[0]
  return { doc, config, invoke, strategy: new VlmDefaultStrategy() }
}
it('transcribes PDF pages once, preserves provenance and context parents', async () => {
  const f = await fixture()
  const result = await f.strategy.understandImages(f.doc, f.config)
  expect(f.invoke).toHaveBeenCalledTimes(1)
  expect(f.invoke.mock.calls[0][0][0].content).toContain('Transcribe all visible content')
  const ocr = result.chunks.find((chunk) => chunk.metadata.parser === 'vlm')
  expect(ocr.pageContent).toContain('| 0007 | 0 |')
  expect(ocr.metadata).toMatchObject({ page: 2, sourceType: 'pdf_page', imagePath: 'page2.png' })
  expect(ocr.metadata.parentId).toBeUndefined()
  expect(result.chunks.some((chunk) => chunk.metadata.chunkId === 'parent')).toBe(true)
})
it('retains narrative behavior for ordinary embedded images', async () => {
  const f = await fixture(false)
  const result = await f.strategy.understandImages(f.doc, f.config)
  expect(f.invoke.mock.calls[0][0][0].content).toContain('narrative description')
  expect(result.chunks.find((chunk) => chunk.metadata.parser === 'vlm').metadata.parentId).toBe('leaf')
})
it('preserves source text and reports failed OCR without fabricating a transcript', async () => {
  const f = await fixture()
  f.invoke.mockRejectedValue(new Error('model unavailable'))
  const result = await f.strategy.understandImages(f.doc, f.config)
  expect(result.chunks).toHaveLength(3)
  expect(result.metadata.warnings).toEqual([
    { type: 'image_understanding_failed', message: 'model unavailable', imagePath: 'page2.png' }
  ])
})
