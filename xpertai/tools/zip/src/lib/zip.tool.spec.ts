import { buildZipTool } from './zip.tool.js'
import JSZip from 'jszip'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getCurrentTaskInput } from '@langchain/langgraph'

// Mock getCurrentTaskInput
jest.mock('@langchain/langgraph', () => ({
  getCurrentTaskInput: jest.fn()
}))

describe('ZipTool', () => {
  let zipTool: ReturnType<typeof buildZipTool>
  let workspacePath: string
  const mockedGetCurrentTaskInput = getCurrentTaskInput as jest.MockedFunction<typeof getCurrentTaskInput>

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-tool-'))
    mockedGetCurrentTaskInput.mockReturnValue({
      sys: {
        volume: workspacePath,
        workspace_url: 'http://localhost:3000/'
      }
    })
    zipTool = buildZipTool()
  })

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('should create a zip file from multiple files', async () => {
    const message = await callTool(zipTool, {
      files: [
        { name: 'file1.txt', content: 'Content 1' },
        { name: 'file2.txt', content: 'Content 2' }
      ],
      fileName: 'test.zip'
    })
    const parsedResult = message.artifact

    expect(message.content).toBe('Created zip file: test.zip')
    expect(parsedResult.files).toBeDefined()
    expect(parsedResult.files).toHaveLength(1)
    expect(parsedResult.files[0].mimeType).toBe('application/zip')
    expect(parsedResult.files[0].fileName).toBe('test.zip')
    expect(parsedResult.files[0].extension).toBe('zip')
    expect(parsedResult.files[0].filePath).toContain('test.zip')
    expect(parsedResult.files[0].fileUrl).toContain('test.zip')

    const zipBuffer = await fs.readFile(parsedResult.files[0].filePath)
    const createdZip = await JSZip.loadAsync(zipBuffer)
    expect(await createdZip.file('file1.txt')?.async('string')).toBe('Content 1')
    expect(await createdZip.file('file2.txt')?.async('string')).toBe('Content 2')
  })

  it('should preserve the workspace user segment when workspace_url has no trailing slash', async () => {
    mockedGetCurrentTaskInput.mockReturnValue({
      sys: {
        volume: workspacePath,
        workspace_url: 'http://localhost:3000/api/sandbox/volume/user/user-1'
      }
    })

    const message = await callTool(zipTool, {
      files: [{ name: 'file1.txt', content: 'Content 1' }],
      fileName: 'test.zip'
    })

    const parsedResult = message.artifact
    expect(parsedResult.files[0].fileUrl).toBe('http://localhost:3000/api/sandbox/volume/user/user-1/test.zip')
  })

  it('should use default filename if not provided', async () => {
    const message = await callTool(zipTool, {
      files: [{ name: 'file1.txt', content: 'Content 1' }]
    })
    const parsedResult = message.artifact

    expect(message.content).toBe('Created zip file: files.zip')
    expect(parsedResult.files[0].fileName).toBe('files.zip')
  })

  it('should add .zip extension if missing', async () => {
    const message = await callTool(zipTool, {
      files: [{ name: 'file1.txt', content: 'Content 1' }],
      fileName: 'archive'
    })
    const parsedResult = message.artifact

    expect(message.content).toBe('Created zip file: archive.zip')
    expect(parsedResult.files[0].fileName).toBe('archive.zip')
  })

  it('should handle Buffer content', async () => {
    const message = await callTool(zipTool, {
      files: [{ name: 'file1.bin', content: Buffer.from('Binary content') }],
      fileName: 'test.zip'
    })
    const parsedResult = message.artifact

    expect(parsedResult.files).toBeDefined()
    expect(parsedResult.files).toHaveLength(1)
    expect(parsedResult.files[0].fileName).toBe('test.zip')
  })

  it('should return error for empty files array', async () => {
    const message = await callTool(zipTool, { files: [] })
    expect(message.content).toContain('Error creating zip file: No files provided')
    expect(message.artifact.files).toEqual([])
  })

  it('should return error when no valid input provided', async () => {
    const message = await callTool(zipTool, {})
    expect(message.content).toContain('Error creating zip file: No files provided')
    expect(message.artifact.files).toEqual([])
  })
})

async function callTool(tool: ReturnType<typeof buildZipTool>, parameters: Record<string, unknown>) {
  return tool.invoke({
    id: '123',
    name: 'zip',
    type: 'tool_call',
    args: parameters
  })
}
