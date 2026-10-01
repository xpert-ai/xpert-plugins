import { readFile, stat } from 'node:fs/promises'
import type { WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { ZsxqConnectorError } from '../errors.js'
import { attachmentDisplayNames, stageWorkspaceFiles } from './zsxq-file-transfer.js'

describe('Knowledge Planet Workspace Files transfer', () => {
  it('stages bytes into a private temporary directory and cleans it up', async () => {
    const files = Object.create(null) as WorkspaceFilesApi
    files.readRuntimeBuffer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('image'),
      name: 'original.png',
      mimeType: 'image/png',
      size: 5
    })
    const staged = await stageWorkspaceFiles(files, [{ workspacePath: '/workspace/a', originalName: '../safe.png' }])
    expect(await readFile(staged.paths[0], 'utf8')).toBe('image')
    expect((await stat(staged.paths[0])).mode & 0o777).toBe(0o600)
    await staged.cleanup()
    await expect(stat(staged.paths[0])).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('enforces image-only and declared-size constraints', async () => {
    const files = Object.create(null) as WorkspaceFilesApi
    files.readRuntimeBuffer = jest
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('text'), name: 'x.txt', mimeType: 'text/plain', size: 4 })
    await expect(stageWorkspaceFiles(files, [{ path: '/workspace/x' }], { imagesOnly: true })).rejects.toThrow(
      ZsxqConnectorError
    )
    files.readRuntimeBuffer = jest.fn().mockResolvedValue({ buffer: Buffer.from('text'), name: 'x.txt', size: 99 })
    await expect(stageWorkspaceFiles(files, [{ path: '/workspace/x' }])).rejects.toThrow(/declared size/)
  })

  it('returns safe display names for previews', () => {
    expect(attachmentDisplayNames([{ path: '/workspace/a', originalName: '../secret.txt' }])).toEqual(['.._secret.txt'])
  })
})
