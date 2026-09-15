jest.mock('@xpert-ai/plugin-sdk', () => ({
  DocumentTransformerStrategy: () => (target: object) => target,
  XpFileSystem: jest.fn(),
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))

import { MarkItDownTransformerStrategy } from './transformer.strategy.js'
import { XpFileSystem } from '@xpert-ai/plugin-sdk'
import { MarkItDownSandboxConverter } from './convert.js'

const sandboxConverter = new MarkItDownSandboxConverter()
let convert: jest.SpiedFunction<MarkItDownSandboxConverter['convert']>
function parser() {
  return new MarkItDownTransformerStrategy(sandboxConverter)
}

function scopedFiles() {
  const readFile = jest.fn(async () => Buffer.from('source document'))
  const writeFile = jest.fn(async (path: string) => `https://files.test/${path}`)
  const permission = new XpFileSystem(
    { type: 'filesystem', operations: ['read', 'write'], scope: [] },
    '/test',
    'https://files.test'
  )
  permission.readFile = readFile
  permission.writeFile = writeFile
  return { readFile, writeFile, permission }
}

describe('MarkItDown knowledge parser', () => {
  beforeEach(() => {
    convert = jest.spyOn(sandboxConverter, 'convert')
  })
  afterEach(() => jest.restoreAllMocks())
  it('declares document formats without advertising OCR or spreadsheet records', () => {
    const strategy = parser()
    expect(strategy.meta.supportedFileTypes).toEqual(['pdf', 'docx', 'pptx', 'html', 'htm', 'txt', 'md', 'markdown'])
    expect(strategy.meta.providesImageText).toBe(false)
    expect(strategy.meta.configSchema.properties).toEqual({})
  })

  it.each(['md', 'markdown', '.MD', '.MARKDOWN'])('accepts the Markdown document type %s', async (type) => {
    const files = scopedFiles()
    const markdown = '# 设备清单\n\n| 编号 | 数量 |\n| --- | --- |\n| 0007 | 0 |'
    convert.mockResolvedValue({ markdown, sandboxJobId: 'job', runtimeProfile: 'document/python-3.12/v1' })

    const [result] = await parser().transformDocuments([{ id: 'markdown-doc', type, filePath: 'files/source.md' }], {
      stage: 'test',
      permissions: { fileSystem: files.permission }
    })

    expect(convert).toHaveBeenCalledWith('files/source.md', type.replace(/^\./, '').toLowerCase(), {
      signal: undefined,
      fileScope: undefined,
      documentId: 'markdown-doc',
      stage: 'test'
    })
    expect(result.chunks?.[0].pageContent).toBe(markdown)
    expect(result.chunks?.[0].metadata.contentFormat).toBe('markdown')
    expect(result.metadata?.parser).toBe('markitdown')
  })

  it('preserves per-page OCR assets and coverage before shared vision runs', async () => {
    const files = scopedFiles()
    convert.mockResolvedValue({
      markdown: 'native\n![scan](data:image/png;base64,aW1hZ2U=)',
      pages: [
        { page: 1, markdown: 'native PAGE1', needsOcr: false, blank: false },
        { page: 2, markdown: '![scan](data:image/png;base64,aW1hZ2U=)', needsOcr: true, blank: false }
      ],
      sandboxJobId: 'job',
      runtimeProfile: 'document/python-3.12/v1'
    })
    const [result] = await parser().transformDocuments([{ id: 'doc', type: 'pdf', filePath: 'mixed.pdf' }], {
      stage: 'test',
      permissions: { fileSystem: files.permission }
    })
    expect(result.chunks?.map((chunk) => chunk.metadata.page)).toEqual([1, 2])
    expect(result.metadata?.assets?.find((asset) => asset.type === 'image')).toMatchObject({
      sourceType: 'pdf_page',
      page: 2
    })
    expect(result.metadata?.parserDiagnostics.pages.map((page) => page.status)).toEqual(['text', 'needs-ocr'])
    expect(result.chunks?.[1].pageContent).not.toContain('base64')
  })

  it('requires scoped source access and rejects unsupported formats before conversion', async () => {
    const strategy = parser()
    await expect(strategy.transformDocuments([{ type: 'pdf' }], { stage: 'test' })).rejects.toThrow(
      'file-system permission'
    )
  })

  it('preserves Markdown and embedded images under the granted knowledge file system', async () => {
    const files = scopedFiles()
    convert.mockResolvedValue({
      markdown: '# Manual\n\n![diagram](data:image/png;base64,aW1hZ2U=)\n\n| A | B |',
      title: 'Manual',
      sandboxJobId: 'job',
      runtimeProfile: 'document/python-3.12/v1'
    })
    const [result] = await parser().transformDocuments([{ id: 'doc', type: 'docx', filePath: 'files/source.docx' }], {
      stage: 'test',
      permissions: { fileSystem: files.permission }
    })
    expect(convert).toHaveBeenCalledWith('files/source.docx', 'docx', expect.objectContaining({ stage: 'test' }))
    expect(result.id).toBe('doc')
    expect(result.metadata?.parser).toBe('markitdown')
    expect(result.chunks?.[0].pageContent).toContain('| A | B |')
    expect(result.chunks?.[0].pageContent).not.toContain('base64')
    expect(result.chunks?.[0].metadata.contentFormat).toBe('markdown')
    expect(result.metadata?.assets?.map((item) => item.type)).toEqual(['image', 'file'])
    expect(files.writeFile).toHaveBeenCalledWith(expect.stringMatching(/image-1.png$/), Buffer.from('image'))
  })

  it('does not read unsupported files or bypass the granted filesystem with a URL', async () => {
    const files = scopedFiles()
    const strategy = parser()
    const config = { stage: 'test' as const, permissions: { fileSystem: files.permission } }
    await expect(strategy.transformDocuments([{ type: 'xlsx', filePath: 'table.xlsx' }], config)).rejects.toThrow(
      'does not support'
    )
    await expect(strategy.transformDocuments([{ type: 'pdf', fileUrl: 'file:///etc/passwd' }], config)).rejects.toThrow(
      'uploaded original'
    )
    expect(files.readFile).not.toHaveBeenCalled()
  })

  it('propagates conversion failures without fabricating successful content', async () => {
    const files = scopedFiles()
    convert.mockRejectedValue(new Error('no text'))
    await expect(
      parser().transformDocuments([{ type: 'pdf', filePath: 'scan.pdf' }], {
        stage: 'test',
        permissions: { fileSystem: files.permission }
      })
    ).rejects.toThrow('no text')
    expect(files.writeFile).not.toHaveBeenCalled()
  })

  it('honors cancellation before accessing a document', async () => {
    const files = scopedFiles()
    await expect(
      parser().transformDocuments([{ type: 'pdf', filePath: 'source.pdf' }], {
        stage: 'test',
        permissions: { fileSystem: files.permission },
        signal: AbortSignal.abort()
      })
    ).rejects.toThrow()
    expect(files.readFile).not.toHaveBeenCalled()
  })
})
