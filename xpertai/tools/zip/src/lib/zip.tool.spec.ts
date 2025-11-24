import { buildZipTool } from './zip.tool.js'
import JSZip from 'jszip'

describe('ZipTool', () => {
  let zipTool: ReturnType<typeof buildZipTool>

  beforeEach(() => {
    zipTool = buildZipTool()
  })

  it('should create a zip file from multiple files', async () => {
    const result = await zipTool.invoke({
      files: [
        { name: 'file1.txt', content: 'Content 1' },
        { name: 'file2.txt', content: 'Content 2' }
      ],
      file_name: 'test.zip'
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.blob).toBeDefined()
    expect(parsedResult.mime_type).toBe('application/zip')
    expect(parsedResult.filename).toBe('test.zip')

    // Verify zip contents
    const zipBuffer = Buffer.from(parsedResult.blob, 'base64')
    const zip = await JSZip.loadAsync(zipBuffer)
    
    expect(zip.files['file1.txt']).toBeDefined()
    expect(zip.files['file2.txt']).toBeDefined()
    
    const content1 = await zip.files['file1.txt'].async('string')
    const content2 = await zip.files['file2.txt'].async('string')
    
    expect(content1).toBe('Content 1')
    expect(content2).toBe('Content 2')
  })

  it('should use default filename if not provided', async () => {
    const result = await zipTool.invoke({
      files: [
        { name: 'file1.txt', content: 'Content 1' }
      ]
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.filename).toBe('files.zip')
  })

  it('should add .zip extension if missing', async () => {
    const result = await zipTool.invoke({
      files: [
        { name: 'file1.txt', content: 'Content 1' }
      ],
      file_name: 'archive'
    })

    const parsedResult = JSON.parse(result as string)
    expect(parsedResult.filename).toBe('archive.zip')
  })

  it('should handle Buffer content', async () => {
    const result = await zipTool.invoke({
      files: [
        { name: 'file1.bin', content: Buffer.from('Binary content') }
      ],
      file_name: 'test.zip'
    })

    const parsedResult = JSON.parse(result as string)
    const zipBuffer = Buffer.from(parsedResult.blob, 'base64')
    const zip = await JSZip.loadAsync(zipBuffer)
    
    const content = await zip.files['file1.bin'].async('nodebuffer')
    expect(content.toString()).toBe('Binary content')
  })

  it('should return error for empty files array', async () => {
    const result = await zipTool.invoke({
      files: []
    })

    expect(result).toContain('Error: No files provided')
  })

  it('should return error for null files', async () => {
    const result = await zipTool.invoke({
      files: [null as any]
    })

    expect(result).toContain('Error: No files provided')
  })
})

