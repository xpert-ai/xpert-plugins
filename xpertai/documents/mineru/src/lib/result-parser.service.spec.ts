import type { XpFileSystem } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import unzipper from 'unzipper'
import { MinerUResultParserService } from './result-parser.service.js'

type FakeEntry = { path: string; type: 'File'; buffer: () => Promise<Buffer> }

function entry(path: string, content: string | Buffer): FakeEntry {
  return {
    path,
    type: 'File',
    buffer: async () => (Buffer.isBuffer(content) ? content : Buffer.from(content))
  }
}

function fileSystemMock() {
  const files = new Map<string, Buffer>()
  const fileSystem = {
    async writeFile(filePath: string, content: string | Buffer) {
      files.set(filePath, Buffer.isBuffer(content) ? content : Buffer.from(content))
      return `http://files.test/${encodeURIComponent(filePath)}`
    }
  } as unknown as XpFileSystem
  return { fileSystem, files }
}

describe('MinerUResultParserService', () => {
  afterEach(() => jest.restoreAllMocks())

  it('recognizes current Markdown/middle/content-list output and rewrites nested image paths', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: Buffer.from('zip') })
    jest.spyOn(unzipper.Open, 'buffer').mockResolvedValue({
      files: [
        entry('document/document.md', '# Result\n\n![figure](images/a.png)'),
        entry('document/images/a.png', Buffer.from('image')),
        entry('document/document_middle.json', JSON.stringify({ _backend: 'vlm', _version_name: '3.1.15' })),
        entry('document/document_content_list_v2.json', JSON.stringify([{ page_idx: 0, blocks: [] }]))
      ]
    } as any)
    const { fileSystem, files } = fileSystemMock()

    const result = await new MinerUResultParserService().parseFromUrl(
      'https://cdn.test/result.zip',
      'task-1',
      { id: 'doc-1', folder: 'knowledge' },
      fileSystem,
      { serverType: 'official', modelVersion: 'vlm', fileName: 'document.pdf' }
    )

    expect(result.chunks[0].pageContent).toContain(
      '![figure](http://files.test/knowledge%2Fmineru%2Fdoc-1%2Ftask-1%2Fdocument%2Fimages%2Fa.png)'
    )
    expect(result.chunks[0].metadata.assets).toHaveLength(4)
    expect(result.chunks[0].metadata.mineru).toEqual(
      expect.objectContaining({ serverType: 'official', modelVersion: 'vlm' })
    )
    expect(result.metadata.mineruBackend).toBe('vlm')
    expect(result.metadata.mineruVersion).toBe('3.1.15')
    expect(files.has('knowledge/mineru/doc-1/task-1/document/document_content_list_v2.json')).toBe(true)
  })

  it('keeps images required by Markdown when raw-output preservation is disabled', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: Buffer.from('zip') })
    jest.spyOn(unzipper.Open, 'buffer').mockResolvedValue({
      files: [entry('full.md', '![image](images/a.png)'), entry('images/a.png', Buffer.from('image'))]
    } as any)
    const { fileSystem, files } = fileSystemMock()

    const result = await new MinerUResultParserService().parseFromUrl(
      'https://cdn.test/result.zip',
      'task-2',
      { id: 'doc-2' },
      fileSystem,
      { preserveRawOutput: false, serverType: 'official' }
    )

    expect(files.size).toBe(1)
    expect(result.metadata.assets).toHaveLength(1)
    expect(result.metadata.assets?.[0].type).toBe('image')
    expect(result.chunks[0].pageContent).toContain('http://files.test/')
  })

  it('rejects path traversal in result archives', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: Buffer.from('zip') })
    jest.spyOn(unzipper.Open, 'buffer').mockResolvedValue({ files: [entry('../escape.md', '# unsafe')] } as any)
    const { fileSystem } = fileSystemMock()

    await expect(
      new MinerUResultParserService().parseFromUrl(
        'https://cdn.test/result.zip',
        'task-3',
        { id: 'doc-3' },
        fileSystem
      )
    ).rejects.toThrow('unsafe path')
  })

  it('archives current self-hosted content_list_v2 output', async () => {
    const { fileSystem, files } = fileSystemMock()
    const result = await new MinerUResultParserService().parseLocalTask(
      {
        mdContent: '# Local',
        contentList: [{ type: 'text', text: 'Local' }],
        contentListV2: [{ page_idx: 0, blocks: [] }],
        images: [],
        raw: { md_content: '# Local' },
        fileName: 'local.pdf'
      },
      'task-local',
      { id: 'doc-local' },
      fileSystem,
      { serverType: 'self-hosted', modelVersion: 'pipeline' }
    )

    expect(result.chunks[0].pageContent).toBe('# Local')
    expect(result.chunks[0].metadata.mineru).toEqual(
      expect.objectContaining({ serverType: 'self-hosted', modelVersion: 'pipeline' })
    )
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        'mineru/doc-local/task-local/result.md',
        'mineru/doc-local/task-local/content_list.json',
        'mineru/doc-local/task-local/content_list_v2.json',
        'mineru/doc-local/task-local/raw-response.json'
      ])
    )
  })
})
