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
    const input = {
      files: [
        { name: 'file1.txt', content: 'Content 1' },
        { name: 'file2.txt', content: 'Content 2' }
      ],
      fileName: 'test.zip'
    }
    console.log('\n[ZIP TEST 1] 压缩多个文件')
    console.log('输入参数:', JSON.stringify(input, null, 2))
    
    const result = await zipTool.invoke(input)
    console.log('输出结果:', result)

    const parsedResult = JSON.parse(result as string)
    console.log('解析后输出:', JSON.stringify(parsedResult, null, 2))
    
    expect(parsedResult.files).toBeDefined()
    expect(parsedResult.files).toHaveLength(1)
    expect(parsedResult.files[0].mimeType).toBe('application/zip')
    expect(parsedResult.files[0].fileName).toBe('test.zip')
    expect(parsedResult.files[0].extension).toBe('zip')
    expect(parsedResult.files[0].filePath).toContain('test.zip')
    expect(parsedResult.files[0].fileUrl).toContain('test.zip')
  })

  it('should use default filename if not provided', async () => {
    const input = {
      files: [
        { name: 'file1.txt', content: 'Content 1' }
      ]
    }
    console.log('\n[ZIP TEST 2] 使用默认文件名')
    console.log('输入参数:', JSON.stringify(input, null, 2))
    
    const result = await zipTool.invoke(input)
    console.log('输出结果:', result)

    const parsedResult = JSON.parse(result as string)
    console.log('解析后输出:', JSON.stringify(parsedResult, null, 2))
    
    expect(parsedResult.files[0].fileName).toBe('files.zip')
  })

  it('should add .zip extension if missing', async () => {
    const input = {
      files: [
        { name: 'file1.txt', content: 'Content 1' }
      ],
      fileName: 'archive'
    }
    console.log('\n[ZIP TEST 3] 自动添加.zip扩展名')
    console.log('输入参数:', JSON.stringify(input, null, 2))
    
    const result = await zipTool.invoke(input)
    console.log('输出结果:', result)

    const parsedResult = JSON.parse(result as string)
    console.log('解析后输出:', JSON.stringify(parsedResult, null, 2))
    
    expect(parsedResult.files[0].fileName).toBe('archive.zip')
  })

  it('should handle Buffer content', async () => {
    const input = {
      files: [
        { name: 'file1.bin', content: Buffer.from('Binary content') }
      ],
      fileName: 'test.zip'
    }
    console.log('\n[ZIP TEST 4] 处理Buffer内容')
    console.log('输入参数:', { files: [{ name: 'file1.bin', content: '<Buffer>' }], fileName: 'test.zip' })
    
    const result = await zipTool.invoke(input)
    console.log('输出结果:', result)

    const parsedResult = JSON.parse(result as string)
    console.log('解析后输出:', JSON.stringify(parsedResult, null, 2))
    
    expect(parsedResult.files).toBeDefined()
    expect(parsedResult.files).toHaveLength(1)
    expect(parsedResult.files[0].fileName).toBe('test.zip')
  })

  it('should return error for empty files array', async () => {
    const input = { files: [] }
    console.log('\n[ZIP TEST 5] 空文件数组错误')
    console.log('输入参数:', JSON.stringify(input, null, 2))
    
    const result = await zipTool.invoke(input)
    console.log('输出结果:', result)

    expect(result).toContain('Error: No files provided')
  })

  it('should return error when no valid input provided', async () => {
    const input = {}
    console.log('\n[ZIP TEST 6] 无有效输入错误')
    console.log('输入参数:', JSON.stringify(input, null, 2))
    
    const result = await zipTool.invoke(input)
    console.log('输出结果:', result)

    expect(result).toContain('Error: No files provided')
  })
})

