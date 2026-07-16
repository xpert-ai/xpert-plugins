import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import {
	WORKSPACE_FILES_SOURCE,
	type WorkspaceFileLocator,
	type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'

export const LARK_MAX_SEND_FILE_BYTES = 25 * 1024 * 1024

export type LarkFileUploadType = 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream'
export type LarkFileMessageType = 'audio' | 'media' | 'file'

export type LarkSendFileReference = {
	source?: string | null
	filePath?: string | null
	workspacePath?: string | null
	originalName?: string | null
	name?: string | null
	mimeType?: string | null
	size?: number | null
}

export type LarkSendFileDescriptor = {
	path?: string | null
	filePath?: string | null
	workspacePath?: string | null
	fileRef?: LarkSendFileReference | null
	originalName?: string | null
	name?: string | null
	mimeType?: string | null
	mimetype?: string | null
	extension?: string | null
	size?: number | null
}

export type LarkResolvedSendFile = {
	buffer: Buffer
	fileName: string
	mimeType: string
	extension?: string
	size: number
	sha256: string
	fileType: LarkFileUploadType
	messageType: LarkFileMessageType
}

export type LarkSendFileMetadata = Pick<
	LarkResolvedSendFile,
	'fileName' | 'mimeType' | 'size' | 'sha256' | 'messageType'
>

const MIME_BY_EXTENSION: Record<string, string> = {
	csv: 'text/csv',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	gif: 'image/gif',
	html: 'text/html',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	json: 'application/json',
	md: 'text/markdown',
	mp4: 'video/mp4',
	opus: 'audio/opus',
	pdf: 'application/pdf',
	png: 'image/png',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	txt: 'text/plain',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	zip: 'application/zip'
}

export async function resolveLarkSendFileFromWorkspace(
	descriptor: LarkSendFileDescriptor,
	options: {
		workspaceFiles: Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>
		maxBytes?: number
	}
): Promise<LarkResolvedSendFile> {
	const locator = toWorkspaceFileLocator(descriptor)
	const file = await options.workspaceFiles.readRuntimeBuffer(locator)
	return resolveLarkSendFileFromBuffer(file.buffer, {
		descriptor,
		fallbackName: file.name,
		fallbackMimeType: file.mimeType,
		fallbackPath: file.workspacePath || file.filePath,
		maxBytes: options.maxBytes
	})
}

export function resolveLarkSendFileFromBuffer(
	buffer: Buffer,
	options: {
		descriptor: LarkSendFileDescriptor
		fallbackName?: string | null
		fallbackMimeType?: string | null
		fallbackPath?: string | null
		maxBytes?: number
	}
): LarkResolvedSendFile {
	const maxBytes = options.maxBytes ?? LARK_MAX_SEND_FILE_BYTES
	if (!buffer.length) {
		throw new Error('Lark file send does not support empty files.')
	}
	if (buffer.length > maxBytes) {
		throw new Error(
			`Lark file send file is too large: ${buffer.length} bytes; maximum is ${maxBytes} bytes.`
		)
	}

	const descriptor = options.descriptor
	const fallbackPath = normalizeString(options.fallbackPath) || resolveDescriptorPath(descriptor)
	const fileName = sanitizeLarkSendFileName(
		descriptor.originalName || descriptor.name,
		options.fallbackName || basenamePortable(fallbackPath) || 'file'
	)
	const extension = resolveFileExtension(fileName, fallbackPath, descriptor.extension)
	const mimeType =
		normalizeString(descriptor.mimeType || descriptor.mimetype) ||
		normalizeString(options.fallbackMimeType) ||
		(extension ? MIME_BY_EXTENSION[extension] : '') ||
		'application/octet-stream'
	const delivery = resolveLarkFileDelivery(extension, mimeType)

	return {
		buffer,
		fileName,
		mimeType,
		...(extension ? { extension } : {}),
		size: buffer.length,
		sha256: createHash('sha256').update(buffer).digest('hex'),
		...delivery
	}
}

export function toLarkSendFileMetadata(file: LarkResolvedSendFile): LarkSendFileMetadata {
	return {
		fileName: file.fileName,
		mimeType: file.mimeType,
		size: file.size,
		sha256: file.sha256,
		messageType: file.messageType
	}
}

export function buildLarkFileSendUuid(input: {
	toolCallId?: string | null
	integrationId: string
	recipientType: string
	recipientId: string
	sha256: string
}): string | undefined {
	const toolCallId = normalizeString(input.toolCallId)
	if (!toolCallId) {
		return undefined
	}
	const digest = createHash('sha256')
		.update(
			[
				toolCallId,
				input.integrationId,
				input.recipientType,
				input.recipientId,
				input.sha256
			].join('\0')
		)
		.digest('hex')
	return `lfs_${digest.slice(0, 46)}`
}

export function readLarkUploadedFileKey(value: unknown): string | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined
	}
	const record = value as Record<string, unknown>
	const direct = normalizeString(record.file_key)
	if (direct) {
		return direct
	}
	const data = record.data
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return undefined
	}
	return normalizeString((data as Record<string, unknown>).file_key) || undefined
}

export function sanitizeLarkSendFileName(value?: string | null, fallback?: string | null): string {
	const raw = normalizeString(value) || normalizeString(fallback) || 'file'
	const base = basenamePortable(raw.replace(/\0/g, ''))
	const sanitized = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
	return sanitized.slice(0, 250) || 'file'
}

function toWorkspaceFileLocator(descriptor: LarkSendFileDescriptor): WorkspaceFileLocator {
	const source = normalizeString(descriptor.fileRef?.source)
	if (source && source !== WORKSPACE_FILES_SOURCE) {
		throw new Error(`Unsupported Lark file reference source: ${source}`)
	}
	const path = validateWorkspaceFilePath(resolveDescriptorPath(descriptor))
	return {
		path,
		originalName: descriptor.originalName,
		name: descriptor.name,
		mimeType: descriptor.mimeType,
		mimetype: descriptor.mimetype,
		size: descriptor.size
	}
}

function resolveDescriptorPath(descriptor: LarkSendFileDescriptor): string {
	return (
		normalizeString(descriptor.fileRef?.filePath) ||
		normalizeString(descriptor.fileRef?.workspacePath) ||
		normalizeString(descriptor.path) ||
		normalizeString(descriptor.filePath) ||
		normalizeString(descriptor.workspacePath)
	)
}

function validateWorkspaceFilePath(value: string): string {
	const path = normalizeString(value)
	if (!path) {
		throw new Error(
			'Lark file send requires file.path, file.filePath, file.workspacePath, or a workspace fileRef.'
		)
	}
	if (path.includes('\0')) {
		throw new Error('Lark file send path contains an invalid null byte.')
	}

	const normalized = path.replace(/\\/g, '/')
	if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
		throw new Error('Lark file send only supports files in the current Xpert workspace.')
	}
	if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) {
		throw new Error('Lark file send does not support host absolute paths.')
	}
	if (normalized.startsWith('/') && !normalized.startsWith('/workspace/')) {
		throw new Error('Lark file send does not support host absolute paths.')
	}

	const workspaceRelative = normalized.startsWith('/workspace/')
		? normalized.slice('/workspace/'.length)
		: normalized.replace(/^\.\//, '')
	const segments = workspaceRelative.split('/').filter(Boolean)
	if (!segments.length) {
		throw new Error('Lark file send requires a file path, not the workspace root.')
	}
	if (segments.includes('..')) {
		throw new Error('Lark file send path cannot escape the current workspace.')
	}
	return normalized
}

function resolveLarkFileDelivery(
	extension: string | undefined,
	mimeType: string
): Pick<LarkResolvedSendFile, 'fileType' | 'messageType'> {
	const normalizedMimeType = mimeType.toLowerCase()
	if (extension === 'opus' || normalizedMimeType === 'audio/opus') {
		return { fileType: 'opus', messageType: 'audio' }
	}
	if (extension === 'mp4' || normalizedMimeType === 'video/mp4') {
		return { fileType: 'mp4', messageType: 'media' }
	}
	if (extension === 'pdf' || normalizedMimeType === 'application/pdf') {
		return { fileType: 'pdf', messageType: 'file' }
	}
	if (extension === 'doc' || normalizedMimeType === 'application/msword') {
		return { fileType: 'doc', messageType: 'file' }
	}
	if (extension === 'xls' || normalizedMimeType === 'application/vnd.ms-excel') {
		return { fileType: 'xls', messageType: 'file' }
	}
	if (extension === 'ppt' || normalizedMimeType === 'application/vnd.ms-powerpoint') {
		return { fileType: 'ppt', messageType: 'file' }
	}
	return { fileType: 'stream', messageType: 'file' }
}

function resolveFileExtension(
	fileName: string,
	fallbackPath: string,
	explicit?: string | null
): string | undefined {
	const normalizedExplicit = normalizeString(explicit).replace(/^\./, '').toLowerCase()
	if (normalizedExplicit) {
		return normalizedExplicit
	}
	return (
		extname(fileName).replace(/^\./, '').toLowerCase() ||
		extname(fallbackPath).replace(/^\./, '').toLowerCase() ||
		undefined
	)
}

function basenamePortable(value?: string | null): string {
	const normalized = normalizeString(value).replace(/\\/g, '/')
	return normalized.split('/').filter(Boolean).pop() || ''
}

function normalizeString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : ''
}
