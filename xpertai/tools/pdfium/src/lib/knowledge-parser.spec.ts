jest.mock('@xpert-ai/plugin-sdk', () => ({
  DocumentTransformerStrategy: () => (target: object) => target
}))
jest.mock('./converter.js', () => ({
  PdfiumOptionsSchema: { parse: jest.fn() },
  withPdfiumPages: jest.fn()
}))

import { PdfiumTransformerStrategy } from './transformer.strategy.js'
import { withPdfiumPages } from './converter.js'
import type { XpFileSystem } from '@xpert-ai/plugin-sdk'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('PDFium knowledge parser', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pdfium-spec-'))
    await writeFile(join(directory, 'page-1.png'), 'image 1')
    await writeFile(join(directory, 'page-2.png'), 'image 2')
    jest.mocked(withPdfiumPages).mockImplementation(async (_data, _options, consume) =>
      consume(
        [
          { page: 1, text: 'Native text', imageName: 'page-1.png' },
          { page: 2, text: '', imageName: 'page-2.png' }
        ],
        directory
      )
    )
  })
  afterEach(async () => {
    jest.clearAllMocks()
    await rm(directory, { recursive: true, force: true })
  })
  it('is a PDF-only converter without built-in OCR', () => {
    const parser = new PdfiumTransformerStrategy()
    expect(parser.meta.supportedFileTypes).toEqual(['pdf'])
    expect(parser.meta.providesImageText).toBe(false)
    expect(parser.meta.configSchema.properties).toEqual({})
  })

  it('requires scoped source access', async () => {
    const parser = new PdfiumTransformerStrategy()
    await expect(parser.transformDocuments([{ type: 'pdf' }], { stage: 'test' })).rejects.toThrow(
      'file-system permission'
    )
  })

  it('preserves page numbers and marks scanned pages as images for the image-understanding stage', async () => {
    const write = jest.fn(async (path: string) => `https://files.test/${path}`)
    const permission = { readFile: async () => Buffer.from('pdf'), writeFile: write } as XpFileSystem
    const [result] = await new PdfiumTransformerStrategy().transformDocuments(
      [{ id: 'doc', type: 'pdf', filePath: 'input.pdf' }],
      { stage: 'test', permissions: { fileSystem: permission } }
    )
    expect(result.id).toBe('doc')
    expect(result.metadata?.sourcePageCount).toBe(2)
    expect(result.chunks?.map((chunk) => chunk.metadata.page)).toEqual([1, 2])
    expect(result.chunks?.map((chunk) => chunk.metadata.mediaType)).toEqual(['text', 'image'])
    expect(result.chunks?.[0].pageContent).toBe('Native text')
    expect(result.metadata?.assets?.filter((asset) => asset.type === 'image').map((asset) => asset.page)).toEqual([
      1, 2
    ])
    expect(result.chunks?.[1].pageContent).toContain(result.metadata?.assets?.[1].url)
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/result.md$/), expect.stringContaining('\n\nNative text'))
  })

  it('rejects Word files before calling the PDF implementation', async () => {
    const permission = { readFile: jest.fn() } as XpFileSystem
    await expect(
      new PdfiumTransformerStrategy().transformDocuments([{ type: 'docx', filePath: 'a.docx' }], {
        stage: 'test',
        permissions: { fileSystem: permission }
      })
    ).rejects.toThrow('only supports PDF')
    expect(withPdfiumPages).not.toHaveBeenCalled()
    expect(permission.readFile).not.toHaveBeenCalled()
  })

  it('does not convert when cancelled before starting', async () => {
    await expect(
      new PdfiumTransformerStrategy().transformDocuments([{ type: 'pdf', filePath: 'a.pdf' }], {
        stage: 'test',
        signal: AbortSignal.abort(),
        permissions: { fileSystem: {} as XpFileSystem }
      })
    ).rejects.toThrow()
    expect(withPdfiumPages).not.toHaveBeenCalled()
  })
})
