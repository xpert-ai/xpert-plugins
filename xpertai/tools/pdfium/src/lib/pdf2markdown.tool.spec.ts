import { getCurrentTaskInput } from '@langchain/langgraph'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { withPdfiumPages } from './converter.js'
import { buildPdfToMarkdownTool } from './pdf2markdown.tool.js'

jest.mock('@langchain/langgraph', () => ({ getCurrentTaskInput: jest.fn() }))
jest.mock('./converter.js', () => ({ withPdfiumPages: jest.fn() }))

describe('PDFium tool output isolation', () => {
  let directory: string
  let workspace: string
  const baseUrl = 'https://files.test/workspace'

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'pdfium-output-spec-'))
    workspace = path.join(directory, 'workspace')
    jest.mocked(getCurrentTaskInput).mockReturnValue({ sys: { volume: workspace, workspace_url: baseUrl } })
    for (const text of ['first', 'second']) {
      await writeFile(path.join(directory, `${text}.pdf`), text)
      await mkdir(path.join(directory, text))
      await writeFile(path.join(directory, text, 'page-1.png'), `${text} image`)
    }
    jest.mocked(withPdfiumPages).mockImplementation(async (buffer, _options, consume) => {
      const text = buffer.toString()
      return consume([{ page: 1, text, imageName: 'page-1.png' }], path.join(directory, text))
    })
  })

  afterEach(async () => {
    jest.clearAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it.each([
    ['a b.pdf', 'a_b.pdf'],
    ['report.pdf', 'report.pdf']
  ])('keeps all Markdown and images for %s and %s in one batch', async (firstName, secondName) => {
    const result = await buildPdfToMarkdownTool().invoke({
      id: 'batch',
      name: 'pdf_to_markdown',
      type: 'tool_call',
      args: {
        file: [
          { fileName: firstName, filePath: path.join(directory, 'first.pdf') },
          { fileName: secondName, filePath: path.join(directory, 'second.pdf') }
        ]
      }
    })
    const [firstMarkdown, firstImage, secondMarkdown, secondImage] = result.artifact.files
    expect(await readFile(firstMarkdown.filePath, 'utf8')).toContain('\n\nfirst\n\n')
    expect(await readFile(secondMarkdown.filePath, 'utf8')).toContain('\n\nsecond\n\n')
    expect(await readFile(firstImage.filePath, 'utf8')).toBe('first image')
    expect(await readFile(secondImage.filePath, 'utf8')).toBe('second image')
    expect(firstMarkdown.filePath).not.toBe(secondMarkdown.filePath)

    for (const artifact of result.artifact.files) {
      const relativeUrl = new URL(artifact.fileUrl).pathname.slice('/workspace/'.length)
      expect(path.join(workspace, decodeURIComponent(relativeUrl))).toBe(artifact.filePath)
      expect(path.join(workspace, artifact.fileName)).toBe(artifact.filePath)
    }
    expect(path.dirname(firstMarkdown.filePath)).toBe(path.dirname(firstImage.filePath))
    expect(await readFile(firstMarkdown.filePath, 'utf8')).toContain('![Page 1](page-1.png)')
  })

  it.each([false, true])('preserves earlier same-name outputs across calls (concurrent: %s)', async (concurrent) => {
    const tool = buildPdfToMarkdownTool()
    const invoke = (text: string) =>
      tool.invoke({
        id: text,
        name: 'pdf_to_markdown',
        type: 'tool_call',
        args: { fileName: 'report.pdf', filePath: path.join(directory, `${text}.pdf`) }
      })
    const results = concurrent
      ? await Promise.all([invoke('first'), invoke('second')])
      : [await invoke('first'), await invoke('second')]
    for (const [index, text] of ['first', 'second'].entries()) {
      const [markdown, image] = results[index].artifact.files
      expect(await readFile(markdown.filePath, 'utf8')).toContain(`\n\n${text}\n\n`)
      expect(await readFile(image.filePath, 'utf8')).toBe(`${text} image`)
    }
    expect(results[0].artifact.files[0].fileUrl).not.toBe(results[1].artifact.files[0].fileUrl)
  })
})
