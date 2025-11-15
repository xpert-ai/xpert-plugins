import { buildUnzipTool } from './unzip.tool.js'
import JSZip from 'jszip'

describe('UnzipTool', () => {
  let unzipTool: ReturnType<typeof buildUnzipTool>

  beforeEach(() => {
    unzipTool = buildUnzipTool()
  })

  it('should extract files from a valid zip file', async () => {
    // Create a test zip file
    const zip = new JSZip()
    zip.file('test1.txt', 'Hello World 1')
    zip.file('test2.txt', 'Hello World 2')
    zip.file('subfolder/test3.txt', 'Hello World 3')
    
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipArrayBuffer = await zipBlob.arrayBuffer()
    const zipBuffer = Buffer.from(zipArrayBuffer)

    // Test unzip tool
    const result = await unzipTool.invoke({
      file: {
        name: 'test.zip',
        filename: 'test.zip',
        content: zipBuffer
      }
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files).toBeDefined()
    expect(parsedResult.files.length).toBe(3)
    
    // Check file contents
    const file1 = parsedResult.files.find((f: any) => f.filename === 'test1.txt')
    const file2 = parsedResult.files.find((f: any) => f.filename === 'test2.txt')
    const file3 = parsedResult.files.find((f: any) => f.filename === 'subfolder/test3.txt')
    
    expect(file1).toBeDefined()
    expect(Buffer.from(file1.blob, 'base64').toString()).toBe('Hello World 1')
    expect(file1.mime_type).toBe('text/plain')
    
    expect(file2).toBeDefined()
    expect(Buffer.from(file2.blob, 'base64').toString()).toBe('Hello World 2')
    
    expect(file3).toBeDefined()
    expect(Buffer.from(file3.blob, 'base64').toString()).toBe('Hello World 3')
  })

  it('should handle base64 encoded zip file', async () => {
    // Create a test zip file
    const zip = new JSZip()
    zip.file('test.txt', 'Test content')
    
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipArrayBuffer = await zipBlob.arrayBuffer()
    const zipBuffer = Buffer.from(zipArrayBuffer)
    const base64Zip = zipBuffer.toString('base64')

    // Test with base64 string
    const result = await unzipTool.invoke({
      file: {
        name: 'test.zip',
        blob: base64Zip
      }
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files).toBeDefined()
    expect(parsedResult.files.length).toBe(1)
    expect(parsedResult.files[0].filename).toBe('test.txt')
    expect(Buffer.from(parsedResult.files[0].blob, 'base64').toString()).toBe('Test content')
  })

  it('should skip directories and only extract files', async () => {
    const zip = new JSZip()
    zip.file('file1.txt', 'Content 1')
    zip.folder('empty-folder')
    zip.file('file2.txt', 'Content 2')
    
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipArrayBuffer = await zipBlob.arrayBuffer()
    const zipBuffer = Buffer.from(zipArrayBuffer)

    const result = await unzipTool.invoke({
      file: {
        name: 'test.zip',
        content: zipBuffer
      }
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.files.length).toBe(2)
    expect(parsedResult.files.find((f: any) => f.filename.includes('empty-folder'))).toBeUndefined()
  })

  it('should detect correct MIME types', async () => {
    const zip = new JSZip()
    zip.file('test.json', '{"key": "value"}')
    zip.file('test.md', '# Markdown')
    zip.file('test.py', 'print("hello")')
    zip.file('test.txt', 'Plain text')
    
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipArrayBuffer = await zipBlob.arrayBuffer()
    const zipBuffer = Buffer.from(zipArrayBuffer)

    const result = await unzipTool.invoke({
      file: {
        name: 'test.zip',
        content: zipBuffer
      }
    })

    const parsedResult = JSON.parse(result as string)
    const jsonFile = parsedResult.files.find((f: any) => f.filename === 'test.json')
    const mdFile = parsedResult.files.find((f: any) => f.filename === 'test.md')
    const pyFile = parsedResult.files.find((f: any) => f.filename === 'test.py')
    
    expect(jsonFile.mime_type).toBe('application/json')
    expect(mdFile.mime_type).toBe('text/markdown')
    expect(pyFile.mime_type).toBe('text/x-python')
  })

  it('should return error for non-zip file', async () => {
    const result = await unzipTool.invoke({
      file: {
        name: 'test.txt',
        content: Buffer.from('not a zip file')
      }
    })

    expect(result).toContain('Error: Not a zip file provided')
  })

  it('should return error for empty file', async () => {
    const result = await unzipTool.invoke({
      file: {}
    })

    expect(result).toContain('Error: No file provided')
  })

  it('should return error for invalid zip file', async () => {
    const result = await unzipTool.invoke({
      file: {
        name: 'test.zip',
        content: Buffer.from('invalid zip content')
      }
    })

    expect(result).toContain('Error')
  })

  it('should return error for empty zip file', async () => {
    const zip = new JSZip()
    // Only add a directory, no files
    zip.folder('empty-folder')
    
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipArrayBuffer = await zipBlob.arrayBuffer()
    const zipBuffer = Buffer.from(zipArrayBuffer)

    const result = await unzipTool.invoke({
      file: {
        name: 'empty.zip',
        content: zipBuffer
      }
    })

    expect(result).toContain('Error: Zip file is empty or contains only directories')
  })
})

