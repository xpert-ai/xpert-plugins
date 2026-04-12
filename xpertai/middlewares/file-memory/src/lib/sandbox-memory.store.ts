import { TSandboxConfigurable } from '@xpert-ai/contracts'
import { Logger, type LoggerService } from '@nestjs/common'
import { SandboxBackendProtocol, resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import path from 'node:path'

const MEMORY_ROOT = '.xpert/memory'
const MEMORY_STORE_LOG_PREFIX = '[FileMemorySystem]'

type DownloadFileResponse = {
  path: string
  content: Uint8Array | null
  error: string | null
}

export class SandboxMemoryStore {
  readonly rootPath = MEMORY_ROOT
  readonly cacheKey: string
  readonly workingDirectory: string | null

  constructor(
    readonly backend: SandboxBackendProtocol,
    readonly sandbox?: TSandboxConfigurable | null
  ) {
    this.workingDirectory =
      (typeof sandbox?.workingDirectory === 'string' && sandbox.workingDirectory.trim()) ||
      (typeof backend.workingDirectory === 'string' && backend.workingDirectory.trim()) ||
      null
    this.cacheKey = [backend.id, this.workingDirectory ?? 'unknown', this.rootPath].join(':')
  }

  static fromSandbox(sandbox: TSandboxConfigurable | null | undefined) {
    const backend = resolveSandboxBackend(sandbox)
    if (!backend) {
      return null
    }
    return new SandboxMemoryStore(backend, sandbox)
  }

  static require(
    sandbox: TSandboxConfigurable | null | undefined,
    logger?: LoggerService,
    reason = 'file memory runtime'
  ) {
    const store = SandboxMemoryStore.fromSandbox(sandbox)
    if (store) {
      return store
    }

    logger?.warn?.(`${MEMORY_STORE_LOG_PREFIX} sandbox backend is unavailable for ${reason}`)
    throw new Error(`Sandbox backend is unavailable for ${reason}.`)
  }

  resolvePath(...segments: Array<string | undefined | null>) {
    return normalizeRelativePath(this.rootPath, ...segments)
  }

  async listMarkdownFiles(directory: string) {
    const baseDir = this.resolvePath(directory)
    const entries = await this.backend.globInfo('*.md', baseDir)
    return entries
      .filter((entry) => !entry.is_dir && typeof entry.path === 'string' && entry.path.endsWith('.md'))
      .map((entry) => normalizeRelativePath(directory, entry.path))
  }

  async readFile(filePath: string) {
    const targetPath = this.resolvePath(filePath)
    const result = (await this.backend.downloadFiles([targetPath]))[0] as DownloadFileResponse | undefined
    if (!result || result.error || !result.content) {
      throw createFileError('ENOENT', `File not found: ${targetPath}`)
    }
    return Buffer.from(result.content).toString('utf8')
  }

  async writeFile(filePath: string, content: string) {
    const targetPath = this.resolvePath(filePath)
    const result = await this.backend.uploadFiles([[targetPath, Buffer.from(content, 'utf8')]])
    const first = result[0]
    if (!first || first.error) {
      throw new Error(`Failed to write file ${targetPath}: ${first?.error ?? 'unknown_error'}`)
    }
  }

  async getMtimeMs(filePath: string) {
    const targetPath = this.resolvePath(filePath)
    const directory = path.posix.dirname(targetPath)
    const baseName = path.posix.basename(targetPath)
    const entries = await this.backend.lsInfo(directory)
    const matched = entries.find((entry) => normalizeListedPath(entry.path) === targetPath)
    if (!matched?.modified_at && !matched) {
      throw createFileError('ENOENT', `File not found: ${targetPath}`)
    }
    return matched?.modified_at ? Math.floor(new Date(matched.modified_at).getTime()) : Date.now()
  }
}

export function getSandboxMemoryRoot() {
  return MEMORY_ROOT
}

export function normalizeRelativePath(...segments: Array<string | undefined | null>) {
  const joined = path.posix.join(
    ...segments.filter((segment): segment is string => Boolean(segment)).map((segment) => `${segment}`.replace(/\\/g, '/'))
  )
  const normalized = path.posix.normalize(joined).replace(/^\/+/, '')
  if (!normalized || normalized === '.') {
    return ''
  }
  if (normalized.startsWith('..')) {
    throw new Error(`Invalid relative path: ${normalized}`)
  }
  return normalized
}

function normalizeListedPath(value?: string | null) {
  return `${value ?? ''}`.replace(/\\/g, '/').replace(/\/+$/, '')
}

function createFileError(code: 'ENOENT', message: string) {
  const error = new Error(message) as NodeJS.ErrnoException
  error.code = code
  return error
}

export function resolveSandboxMemoryStore(
  sandbox: TSandboxConfigurable | null | undefined,
  logger?: LoggerService,
  reason?: string
) {
  return SandboxMemoryStore.require(sandbox, logger ?? new Logger('SandboxMemoryStore'), reason)
}
