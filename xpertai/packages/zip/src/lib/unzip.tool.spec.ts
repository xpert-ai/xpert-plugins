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
        workspace_path: workspacePath,
        volume: workspacePath,
        workspace_url: 'http://localhost:3000/workspace/'
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

    console.log(parsedResult)
    
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

  // TODO: 测试一个场景：zip里的文件名中有特殊字符#时给出的fileUrl是否正确
  it('should correctly encode fileUrl when filename contains special characters', async () => {
    const zip = new JSZip()
    // Test various special characters that need URL encoding
    zip.file('file#hash.txt', 'Content with hash')
    zip.file('file with spaces.txt', 'Content with spaces')
    zip.file('file%percent.txt', 'Content with percent')
    zip.file('file?question.txt', 'Content with question')
    zip.file('file&ampersand.txt', 'Content with ampersand')
    zip.file('测试中文.txt', 'Content with Chinese characters')

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await unzipTool.invoke({
      content: zipBuffer,
      fileName: 'special-chars.zip'
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files).toHaveLength(6)

    // Check that each file has a properly encoded fileUrl
    const filesByName = new Map(parsedResult.files.map((file: any) => [file.fileName, file]))

    // File with # character
    const hashFile = filesByName.get('file#hash.txt')
    expect(hashFile).toBeDefined()
    expect(hashFile.fileUrl).toBeDefined()
    expect(hashFile.fileUrl).toContain('file%23hash.txt') // # should be encoded as %23
    // Verify the fileUrl is a valid URL
    expect(() => new URL(hashFile.fileUrl)).not.toThrow()

    // File with spaces
    const spaceFile = filesByName.get('file with spaces.txt')
    expect(spaceFile).toBeDefined()
    expect(spaceFile.fileUrl).toBeDefined()
    expect(spaceFile.fileUrl).toContain('file%20with%20spaces.txt') // spaces should be encoded as %20
    expect(() => new URL(spaceFile.fileUrl)).not.toThrow()

    // File with % character
    const percentFile = filesByName.get('file%percent.txt')
    expect(percentFile).toBeDefined()
    expect(percentFile.fileUrl).toBeDefined()
    expect(percentFile.fileUrl).toContain('file%25percent.txt') // % should be encoded as %25
    expect(() => new URL(percentFile.fileUrl)).not.toThrow()

    // File with ? character
    const questionFile = filesByName.get('file?question.txt')
    expect(questionFile).toBeDefined()
    expect(questionFile.fileUrl).toBeDefined()
    expect(questionFile.fileUrl).toContain('file%3Fquestion.txt') // ? should be encoded as %3F
    expect(() => new URL(questionFile.fileUrl)).not.toThrow()

    // File with & character
    const ampersandFile = filesByName.get('file&ampersand.txt')
    expect(ampersandFile).toBeDefined()
    expect(ampersandFile.fileUrl).toBeDefined()
    expect(ampersandFile.fileUrl).toContain('file%26ampersand.txt') // & should be encoded as %26
    expect(() => new URL(ampersandFile.fileUrl)).not.toThrow()

    // File with Chinese characters
    const chineseFile = filesByName.get('测试中文.txt')
    expect(chineseFile).toBeDefined()
    expect(chineseFile.fileUrl).toBeDefined()
    // Chinese characters should be percent-encoded
    expect(chineseFile.fileUrl).toMatch(/%[0-9A-F]{2}/) // Should contain percent-encoded characters
    expect(() => new URL(chineseFile.fileUrl)).not.toThrow()

    // Verify files are actually created and readable
    expect(await fs.readFile(hashFile.filePath, 'utf8')).toBe('Content with hash')
    expect(await fs.readFile(spaceFile.filePath, 'utf8')).toBe('Content with spaces')
    expect(await fs.readFile(percentFile.filePath, 'utf8')).toBe('Content with percent')
    expect(await fs.readFile(questionFile.filePath, 'utf8')).toBe('Content with question')
    expect(await fs.readFile(ampersandFile.filePath, 'utf8')).toBe('Content with ampersand')
    expect(await fs.readFile(chineseFile.filePath, 'utf8')).toBe('Content with Chinese characters')
  })
})
