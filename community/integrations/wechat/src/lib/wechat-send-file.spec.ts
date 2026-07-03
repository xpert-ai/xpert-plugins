import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resolveWechatSendFile,
  resolveWechatSendFilePath,
  sanitizeWechatSendFileName
} from './wechat-send-file.js'

describe('wechat-send-file', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createTempDir() {
    const dir = await mkdtemp(join(tmpdir(), 'wechat-send-file-'))
    tempDirs.push(dir)
    return dir
  }

  it('resolves a readable absolute file and returns safe metadata plus base64 content', async () => {
    const dir = await createTempDir()
    const filePath = join(dir, 'report.txt')
    await writeFile(filePath, 'hello file')

    const result = await resolveWechatSendFile({
      path: filePath,
      originalName: 'Q1/report?.txt',
      mimeType: 'text/plain'
    })

    expect(result).toEqual(
      expect.objectContaining({
        filePath,
        fileName: 'report_.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        size: 10,
        fileContent: Buffer.from('hello file').toString('base64')
      })
    )
    expect(result.sha256).toHaveLength(64)
  })

  it('resolves relative files only inside an absolute workspaceRoot', async () => {
    const dir = await createTempDir()
    const filePath = join(dir, 'out/report.txt')
    await mkdir(join(dir, 'out'))
    await writeFile(filePath, 'workspace file')

    expect(resolveWechatSendFilePath({ path: 'out/report.txt', workspaceRoot: dir })).toBe(filePath)
    expect(() => resolveWechatSendFilePath({ path: '../escape.txt', workspaceRoot: dir })).toThrow('workspaceRoot')
    expect(() => resolveWechatSendFilePath({ path: 'out/report.txt' })).toThrow('绝对路径')
  })

  it('rejects directories, empty files, and oversized files', async () => {
    const dir = await createTempDir()
    const emptyPath = join(dir, 'empty.txt')
    const smallPath = join(dir, 'small.txt')
    await writeFile(emptyPath, '')
    await writeFile(smallPath, 'hello')

    await expect(resolveWechatSendFile({ path: dir })).rejects.toThrow('普通文件')
    await expect(resolveWechatSendFile({ path: emptyPath })).rejects.toThrow('文件为空')
    await expect(resolveWechatSendFile({ path: smallPath }, { maxBytes: 4 })).rejects.toThrow('文件过大')
  })

  it('sanitizes unsafe filenames', () => {
    expect(sanitizeWechatSendFileName('a/b:c?.pdf')).toBe('b_c_.pdf')
    expect(sanitizeWechatSendFileName('', 'fallback.docx')).toBe('fallback.docx')
  })
})
