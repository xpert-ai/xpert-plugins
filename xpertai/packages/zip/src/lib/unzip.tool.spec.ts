import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { getCurrentTaskInput } from '@langchain/langgraph'
import JSZip from 'jszip'
import { buildUnzipTool } from './unzip.tool'

jest.mock('@langchain/langgraph', () => ({
  getCurrentTaskInput: jest.fn()
}))

describe('UnzipTool', () => {
  let unzipTool: ReturnType<typeof buildUnzipTool>
  let workspacePath: string
  const mockedGetCurrentTaskInput = getCurrentTaskInput as jest.MockedFunction<typeof getCurrentTaskInput>

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'unzip-tool-'))
    mockedGetCurrentTaskInput.mockReturnValue({
      sys: {
        workspace_path: workspacePath
      }
    })
    unzipTool = buildUnzipTool()
  })

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('should extract files from a valid zip file', async () => {
    const zip = new JSZip()
    zip.file('test1.txt', 'Hello World 1')
    zip.file('test2.txt', 'Hello World 2')
    zip.file('subfolder/test3.txt', 'Hello World 3')

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await unzipTool.invoke({
      content: zipBuffer
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files).toHaveLength(3)

    const filesByName = new Map(parsedResult.files.map((file: any) => [file.fileName, file]))
    expect(await fs.readFile(filesByName.get('test1.txt').filePath, 'utf8')).toBe('Hello World 1')
    expect(await fs.readFile(filesByName.get('test2.txt').filePath, 'utf8')).toBe('Hello World 2')
    expect(await fs.readFile(filesByName.get('subfolder/test3.txt').filePath, 'utf8')).toBe('Hello World 3')
  })

  it('should handle base64 encoded zip file', async () => {
    const zip = new JSZip()
    zip.file('test.txt', 'Test content')

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const base64Zip = zipBuffer.toString('base64')

    const result = await unzipTool.invoke({
      content: base64Zip
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files).toHaveLength(1)
    const [{ filePath, fileName }] = parsedResult.files
    expect(fileName).toBe('test.txt')
    expect(await fs.readFile(filePath, 'utf8')).toBe('Test content')
  })

  it('should skip directories and only extract files', async () => {
    const zip = new JSZip()
    zip.file('file1.txt', 'Content 1')
    zip.folder('empty-folder')
    zip.file('file2.txt', 'Content 2')

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await unzipTool.invoke({
      content: zipBuffer
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files).toHaveLength(2)
    expect(parsedResult.files.find((file: any) => file.fileName.includes('empty-folder'))).toBeUndefined()
  })

  it('should detect correct MIME types', async () => {
    const zip = new JSZip()
    zip.file('test.json', '{"key": "value"}')
    zip.file('test.md', '# Markdown')
    zip.file('test.py', 'print("hello")')
    zip.file('test.txt', 'Plain text')

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await unzipTool.invoke({
      content: zipBuffer
    })

    const parsedResult = JSON.parse(result as string)
    const getFile = (fileName: string) => parsedResult.files.find((file: any) => file.fileName === fileName)

    expect(getFile('test.json').mimeType).toBe('application/json')
    expect(getFile('test.md').mimeType).toBe('text/markdown')
    expect(getFile('test.py').mimeType).toBe('text/x-python')
    expect(getFile('test.txt').mimeType).toBe('text/plain')
  })

  it('should return error for invalid zip buffer', async () => {
    const result = await unzipTool.invoke({
      content: Buffer.from('not a zip file')
    })

    expect(result).toContain('Error')
  })

  it('should return error for missing content', async () => {
    const result = await unzipTool.invoke({})

    expect(result).toContain('Error: No file provided')
  })

  it('should return error for empty zip file', async () => {
    const zip = new JSZip()
    zip.folder('empty-folder')

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await unzipTool.invoke({
      content: zipBuffer
    })

    expect(result).toContain('Error: Zip file is empty or contains only directories')
  })

  it('should recursively extract nested zip files', async () => {
    const innerZip = new JSZip()
    innerZip.file('inner.txt', 'Nested content')
    const innerBuffer = await innerZip.generateAsync({ type: 'nodebuffer' })

    const outerZip = new JSZip()
    outerZip.file('nested.zip', innerBuffer, { binary: true })
    const outerBuffer = await outerZip.generateAsync({ type: 'nodebuffer' })

    const result = await unzipTool.invoke({
      content: outerBuffer,
      fileName: 'archive.zip'
    })


    const parsedResult = JSON.parse(result as string)
    
    // 查找嵌套文件，路径可能是 nested/inner.txt
    const nestedFile = parsedResult.files.find((file: any) => 
      file.fileName === 'inner.txt' || file.fileName.endsWith('/inner.txt') || file.fileName.endsWith('\\inner.txt') || file.fileName.includes('inner.txt')
    )
    expect(nestedFile).toBeDefined()

    const nestedContent = await fs.readFile(nestedFile.filePath, 'utf8')
    expect(nestedContent).toBe('Nested content')

    // Check that the nested file is extracted (path structure may vary)
    // The important thing is that the file exists and has correct content
    expect(nestedFile.filePath).toBeDefined()
    expect(nestedFile.fileName).toContain('inner.txt')
  })
})
