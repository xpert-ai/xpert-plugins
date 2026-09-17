import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getCurrentTaskInput } from '@langchain/langgraph'
import { withPdfiumPages } from './converter.js'
import { buildPdfToMarkdownTool } from './pdf2markdown.tool.js'

jest.mock('@langchain/langgraph', () => ({ getCurrentTaskInput: jest.fn() }))
jest.mock('./converter.js', () => ({ withPdfiumPages: jest.fn() }))

describe('pdfium tool compatibility', () => {
  let directory: string
  let source: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'pdfium-tool-spec-'))
    source = path.join(directory, 'source.pdf')
    await writeFile(source, 'pdf input')
    await writeFile(path.join(directory, 'page-1.png'), 'image')
    jest
      .mocked(getCurrentTaskInput)
      .mockReturnValue({ sys: { volume: directory, workspace_url: 'https://files.test/workspace' } })
    jest
      .mocked(withPdfiumPages)
      .mockImplementation(async (_buffer, _options, consume) =>
        consume([{ page: 1, text: 'Source text', imageName: 'page-1.png' }], directory)
      )
  })
  afterEach(async () => {
    jest.clearAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it('should convert PDF to markdown and images', async () => {
    const result = await buildPdfToMarkdownTool().invoke({
      id: '123',
      name: 'pdf_to_markdown',
      type: 'tool_call',
      args: { filePath: source }
    })
    expect(result.tool_call_id).toBe('123')
    expect(result.artifact.files[0].fileName).toMatch(/\.md$/)
    expect(result.artifact.files[1].page).toBe(1)
    expect(result.artifact.files[1].fileUrl).toBe(
      `https://files.test/workspace/${result.artifact.files[1].fileName}`
    )
    const markdown = await readFile(result.artifact.files[0].filePath, 'utf8')
    expect(markdown).toContain('\n\nSource text')
    expect(markdown).not.toContain('\\n')
  })

  it('should convert PDF Object to markdown and images', async () => {
    const tool = buildPdfToMarkdownTool()
    for (const file of [{ filePath: source }, [{ filePath: source }]]) {
      const result = await tool.invoke({ id: '123', name: 'pdf_to_markdown', type: 'tool_call', args: { file } })
      expect(result.artifact.files).toHaveLength(2)
      expect(result.artifact.files[0].fileName).toMatch(/\.md$/)
    }
  })

  it('keeps outputs independent when converting several files', async () => {
    const result = await buildPdfToMarkdownTool().invoke({
      id: 'multi',
      name: 'pdf_to_markdown',
      type: 'tool_call',
      args: {
        file: [
          { filePath: source, fileName: 'first.pdf' },
          { filePath: source, fileName: 'second.pdf' }
        ]
      }
    })
    const second = result.artifact.files.filter((item: { mimeType: string }) => item.mimeType === 'text/markdown')[1]
    const markdown = await readFile(second.filePath, 'utf8')
    expect(markdown).toContain('second.pdf')
    expect(markdown).not.toContain('first.pdf')
  })

  it('retains base64 input and passes rendering scale and cancellation to the converter', async () => {
    const signal = new AbortController().signal
    await buildPdfToMarkdownTool().invoke({ content: Buffer.from('bytes').toString('base64'), scale: 1.5 }, { signal })
    expect(withPdfiumPages).toHaveBeenCalledWith(Buffer.from('bytes'), { scale: 1.5, signal }, expect.any(Function))
  })

  it.each([0, -1, 0.1, 8])('preserves the legacy rendering-scale behavior for %s', async (scale) => {
    await buildPdfToMarkdownTool().invoke({ content: Buffer.from('bytes').toString('base64'), scale })
    expect(withPdfiumPages).toHaveBeenCalledWith(
      Buffer.from('bytes'),
      { scale: scale > 0 ? scale : undefined, signal: undefined },
      expect.any(Function)
    )
  })

  it('propagates render errors instead of returning a success artifact', async () => {
    jest.mocked(withPdfiumPages).mockRejectedValue(new Error('corrupt PDF'))
    await expect(buildPdfToMarkdownTool().invoke({ filePath: source })).rejects.toThrow('corrupt PDF')
  })
})
