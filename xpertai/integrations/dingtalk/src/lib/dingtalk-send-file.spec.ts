jest.mock('@xpert-ai/plugin-sdk', () => ({
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files'
}))

import { createHash } from 'node:crypto'
import { WORKSPACE_FILES_SOURCE } from '@xpert-ai/plugin-sdk'
import {
  buildDingTalkSendMediaContent,
  resolveDingTalkSendFileFromBuffer,
  resolveDingTalkSendFileFromWorkspace,
  resolveDingTalkSendImageFromBuffer,
  resolveDingTalkSendMediaFromWorkspace,
  sanitizeDingTalkFileName,
  toDingTalkSendFileMetadata
} from './dingtalk-send-file.js'

describe('dingtalk-send-file', () => {
  it('reads workspace file references without forwarding hidden scope fields', async () => {
    const buffer = Buffer.from('workspace report')
    const readRuntimeBuffer = jest.fn().mockResolvedValue({
      name: 'report.pdf',
      filePath: 'files/report.pdf',
      workspacePath: '/workspace/files/report.pdf',
      mimeType: 'application/pdf',
      size: buffer.length,
      buffer
    })

    const result = await resolveDingTalkSendFileFromWorkspace(
      {
        fileRef: {
          source: WORKSPACE_FILES_SOURCE,
          filePath: 'files/report.pdf'
        },
        originalName: 'report.pdf',
        tenantId: 'tenant-other',
        catalog: 'users'
      } as any,
      { workspaceFiles: { readRuntimeBuffer } as any }
    )

    expect(readRuntimeBuffer).toHaveBeenCalledWith({
      path: 'files/report.pdf',
      originalName: 'report.pdf',
      name: undefined,
      mimeType: undefined,
      mimetype: undefined,
      size: undefined
    })
    expect(result).toEqual(
      expect.objectContaining({
        buffer,
        fileName: 'report.pdf',
        fileType: 'pdf',
        mediaType: 'file',
        mimeType: 'application/pdf',
        size: buffer.length
      })
    )
  })

  it('uses actual bytes for size and hash and returns safe metadata', () => {
    const buffer = Buffer.from('actual file bytes')
    const file = resolveDingTalkSendFileFromBuffer(buffer, {
      descriptor: {
        path: 'files/report.pdf',
        originalName: 'report.pdf',
        size: 999999
      }
    })

    expect(file.size).toBe(buffer.length)
    expect(file.sha256).toBe(createHash('sha256').update(buffer).digest('hex'))
    expect(toDingTalkSendFileMetadata(file)).toEqual({
      fileName: 'report.pdf',
      fileType: 'pdf',
      mediaType: 'file',
      mimeType: 'application/pdf',
      size: buffer.length,
      sha256: file.sha256
    })
    expect(toDingTalkSendFileMetadata(file)).not.toHaveProperty('buffer')
  })

  it.each([
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['gif', 'image/gif'],
    ['webp', 'image/webp']
  ])('routes .%s through the DingTalk image message channel', (extension, mimeType) => {
    const image = resolveDingTalkSendImageFromBuffer(Buffer.from('image bytes'), {
      descriptor: { path: `files/image.${extension}` }
    })

    expect(image).toEqual(
      expect.objectContaining({
        fileName: `image.${extension}`,
        fileType: extension,
        mediaType: 'image',
        mimeType
      })
    )
    expect(buildDingTalkSendMediaContent(image, 'media-image-1')).toEqual({
      msgKey: 'sampleImageMsg',
      msgParam: {
        photoURL: 'media-image-1'
      }
    })
  })

  it('routes workspace images through media resolution while keeping file resolution file-only', async () => {
    const buffer = Buffer.from('workspace image')
    const workspaceFiles = {
      readRuntimeBuffer: jest.fn().mockResolvedValue({
        name: 'chart.png',
        filePath: 'files/chart.png',
        workspacePath: '/workspace/files/chart.png',
        mimeType: 'image/png',
        size: buffer.length,
        buffer
      })
    }

    await expect(
      resolveDingTalkSendMediaFromWorkspace(
        { path: 'files/chart.png' },
        { workspaceFiles: workspaceFiles as any }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        mediaType: 'image',
        fileType: 'png'
      })
    )
    await expect(
      resolveDingTalkSendFileFromWorkspace(
        { path: 'files/chart.png' },
        { workspaceFiles: workspaceFiles as any }
      )
    ).rejects.toThrow('DingTalk file send supports only')
  })

  it.each([
    ['files/report.txt', '.txt'],
    ['files/report.csv', '.csv'],
    ['files/report', 'without an extension']
  ])('rejects DingTalk file types that sampleFile does not support', (path, expectedType) => {
    expect(() =>
      resolveDingTalkSendFileFromBuffer(Buffer.from('unsupported file'), {
        descriptor: { path }
      })
    ).toThrow(expectedType)
  })

  it.each([
    [
      { path: 'files/report.txt', originalName: 'report', extension: 'pdf' },
      'explicit extension .pdf does not match workspace path extension .txt'
    ],
    [
      { path: 'files/report.txt', originalName: 'report.pdf' },
      'filename extension .pdf does not match workspace path extension .txt'
    ]
  ])('rejects conflicting file extension metadata', (descriptor, expectedMessage) => {
    expect(() =>
      resolveDingTalkSendFileFromBuffer(Buffer.from('unsupported file'), {
        descriptor
      })
    ).toThrow(expectedMessage)
  })

  it('rejects empty, oversized, remote, and unsafe workspace inputs', async () => {
    expect(() =>
      resolveDingTalkSendFileFromBuffer(Buffer.alloc(0), {
        descriptor: { path: 'files/empty.txt' }
      })
    ).toThrow('does not support empty files')
    expect(() =>
      resolveDingTalkSendFileFromBuffer(Buffer.alloc(5), {
        descriptor: { path: 'files/large.txt' },
        maxBytes: 4
      })
    ).toThrow('maximum is 4 bytes')

    const readRuntimeBuffer = jest.fn()
    for (const descriptor of [
      {},
      { path: '../secret.txt' },
      { path: '/etc/passwd' },
      { path: 'C:\\secret.txt' },
      { path: 'https://example.com/report.pdf' },
      { path: 'data:text/plain;base64,SGVsbG8=' },
      { fileRef: { source: 'remote.file', filePath: 'files/report.pdf' } }
    ]) {
      await expect(
        resolveDingTalkSendFileFromWorkspace(descriptor as any, {
          workspaceFiles: { readRuntimeBuffer } as any
        })
      ).rejects.toThrow()
    }
    expect(readRuntimeBuffer).not.toHaveBeenCalled()
  })

  it('sanitizes portable file names', () => {
    expect(sanitizeDingTalkFileName('../folder/bad:name?.txt')).toBe('bad_name_.txt')
    expect(sanitizeDingTalkFileName('   ', 'fallback.txt')).toBe('fallback.txt')
    expect(sanitizeDingTalkFileName('a'.repeat(300))).toHaveLength(250)
  })
})
