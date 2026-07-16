jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
		WorkspaceFilesRuntimeCapability: Symbol.for('WorkspaceFilesRuntimeCapability')
	})
})

import { createHash } from 'node:crypto'
import { WORKSPACE_FILES_SOURCE } from '@xpert-ai/plugin-sdk'
import {
	buildLarkFileSendUuid,
	readLarkUploadedFileKey,
	resolveLarkSendFileFromBuffer,
	resolveLarkSendFileFromWorkspace,
	sanitizeLarkSendFileName,
	toLarkSendFileMetadata
} from './lark-send-file.js'

describe('lark-send-file', () => {
	it.each([
		[{ filePath: 'files/report.pdf' }, 'files/report.pdf'],
		[{ workspacePath: '/workspace/files/report.pdf' }, '/workspace/files/report.pdf'],
		[
			{
				fileRef: {
					source: WORKSPACE_FILES_SOURCE,
					filePath: 'files/history-report.pdf',
					workspacePath: '/workspace/files/history-report.pdf'
				}
			},
			'files/history-report.pdf'
		]
	] as const)('reads workspace path aliases without forwarding hidden scope fields', async (descriptor, expectedPath) => {
		const buffer = Buffer.from('workspace report')
		const readRuntimeBuffer = jest.fn(async () => ({
			name: 'report.pdf',
			filePath: 'files/report.pdf',
			workspacePath: '/workspace/files/report.pdf',
			mimeType: 'application/pdf',
			size: buffer.length,
			buffer,
			reference: {
				source: WORKSPACE_FILES_SOURCE,
				filePath: 'files/report.pdf',
				workspacePath: '/workspace/files/report.pdf',
				catalog: 'xperts',
				scopeId: 'xpert-1'
			}
		}))

		const result = await resolveLarkSendFileFromWorkspace(
			{
				...descriptor,
				originalName: 'report.pdf',
				// These fields are deliberately outside the typed contract and must not
				// be forwarded to the runtime locator.
				tenantId: 'tenant-other',
				catalog: 'users',
				scopeId: 'scope-other'
			} as any,
			{ workspaceFiles: { readRuntimeBuffer } as any }
		)

		expect(readRuntimeBuffer).toHaveBeenCalledWith({
			path: expectedPath,
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
				mimeType: 'application/pdf',
				size: buffer.length,
				fileType: 'pdf',
				messageType: 'file'
			})
		)
	})

	it.each([
		['voice.opus', 'audio/opus', 'opus', 'audio'],
		['video.mp4', 'video/mp4', 'mp4', 'media'],
		['report.pdf', 'application/pdf', 'pdf', 'file'],
		['report.doc', 'application/msword', 'doc', 'file'],
		['sheet.xls', 'application/vnd.ms-excel', 'xls', 'file'],
		['slides.ppt', 'application/vnd.ms-powerpoint', 'ppt', 'file'],
		[
			'report.docx',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'stream',
			'file'
		],
		['image.png', 'image/png', 'stream', 'file']
	] as const)('maps %s to Lark upload and message types', (fileName, mimeType, fileType, messageType) => {
		const result = resolveLarkSendFileFromBuffer(Buffer.from('content'), {
			descriptor: {
				path: `files/${fileName}`,
				originalName: fileName,
				mimeType
			}
		})

		expect(result.fileType).toBe(fileType)
		expect(result.messageType).toBe(messageType)
	})

	it('uses actual bytes for size and SHA-256 and returns only safe metadata', () => {
		const buffer = Buffer.from('actual file bytes')
		const file = resolveLarkSendFileFromBuffer(buffer, {
			descriptor: {
				path: 'files/report.txt',
				originalName: 'report.txt',
				size: 999999
			}
		})

		expect(file.size).toBe(buffer.length)
		expect(file.sha256).toBe(createHash('sha256').update(buffer).digest('hex'))
		expect(toLarkSendFileMetadata(file)).toEqual({
			fileName: 'report.txt',
			mimeType: 'text/plain',
			size: buffer.length,
			sha256: file.sha256,
			messageType: 'file'
		})
		expect(toLarkSendFileMetadata(file)).not.toHaveProperty('buffer')
		expect(toLarkSendFileMetadata(file)).not.toHaveProperty('fileType')
	})

	it('rejects empty, oversized, unsupported, and unsafe workspace inputs', async () => {
		expect(() =>
			resolveLarkSendFileFromBuffer(Buffer.alloc(0), {
				descriptor: { path: 'files/empty.txt' }
			})
		).toThrow('does not support empty files')
		expect(() =>
			resolveLarkSendFileFromBuffer(Buffer.alloc(5), {
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
				resolveLarkSendFileFromWorkspace(descriptor as any, {
					workspaceFiles: { readRuntimeBuffer } as any
				})
			).rejects.toThrow()
		}
		expect(readRuntimeBuffer).not.toHaveBeenCalled()
	})

	it('sanitizes portable file names', () => {
		expect(sanitizeLarkSendFileName('../folder/bad:name?.txt')).toBe('bad_name_.txt')
		expect(sanitizeLarkSendFileName('   ', 'fallback.txt')).toBe('fallback.txt')
		expect(sanitizeLarkSendFileName('a'.repeat(300))).toHaveLength(250)
	})

	it('builds stable per-target UUIDs from the tool invocation', () => {
		const input = {
			toolCallId: 'tool-call-1',
			integrationId: 'integration-1',
			recipientType: 'chat_id',
			recipientId: 'chat-1',
			sha256: 'abc123'
		}
		const first = buildLarkFileSendUuid(input)

		expect(first).toBe(buildLarkFileSendUuid(input))
		expect(first).toMatch(/^lfs_[a-f0-9]+$/)
		expect(first!.length).toBeLessThanOrEqual(50)
		expect(
			buildLarkFileSendUuid({
				...input,
				recipientId: 'chat-2'
			})
		).not.toBe(first)
		expect(buildLarkFileSendUuid({ ...input, toolCallId: '' })).toBeUndefined()
	})

	it('reads direct and wrapped upload keys without exposing response data', () => {
		expect(readLarkUploadedFileKey({ file_key: 'file-direct' })).toBe('file-direct')
		expect(readLarkUploadedFileKey({ data: { file_key: 'file-wrapped' } })).toBe(
			'file-wrapped'
		)
		expect(readLarkUploadedFileKey({ data: {} })).toBeUndefined()
		expect(readLarkUploadedFileKey(null)).toBeUndefined()
	})
})
