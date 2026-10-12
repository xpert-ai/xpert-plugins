import { posix } from 'path'
import { TextDecoder } from 'util'
import { BadRequestException } from '@nestjs/common'
import type { SitesSourceFile, SitesSourceReadOptions, SitesSandboxFileInfo } from './types.js'
const SITE_SOURCE_MAX_FILES = 100
const SITE_SOURCE_MAX_FILE_BYTES = 512 * 1024
const SITE_SOURCE_MAX_TOTAL_BYTES = 5 * 1024 * 1024
const SITE_SOURCE_ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.svg',
  '.txt',
  '.md',
  '.webmanifest', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf'
])
const SITE_SOURCE_EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  'coverage',
  'node_modules'
])

type SandboxSourceCandidate = {
  absolutePath: string
  relativePath: string
  size?: number
}

export async function readSandboxSourceFiles(sourcePathInput: string | undefined, sourceOptions?: SitesSourceReadOptions) {
  const backend = sourceOptions?.sandboxBackend
  if (!backend) {
    throw new BadRequestException(
      'Sandbox backend is required to save a Sites version. Create source files with SandboxFile tools, then call Sites with sourcePath.'
    )
  }

  const workingDirectory = sourceOptions?.workingDirectory ?? backend.workingDirectory
  const sourcePath = resolveSandboxSourcePath(sourcePathInput, workingDirectory)
  const entries = await collectSandboxSourceEntries(backend, sourcePath)
  const files = selectSandboxSourceFiles(entries, sourcePath, workingDirectory)
  const downloads = await Promise.resolve(backend.downloadFiles(files.map((file) => file.absolutePath)))
  const downloadsByPath = new Map(downloads.map((download) => [normalizeSandboxPath(download.path), download]))
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let totalBytes = 0

  const sourceFiles = files.map((file) => {
    const download = downloadsByPath.get(normalizeSandboxPath(file.absolutePath))
    if (!download || download.error || download.content == null) {
      throw new BadRequestException(`Unable to read Sites source file "${file.relativePath}": ${download?.error ?? 'missing_content'}`)
    }
    const binary = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(file.relativePath)
    if (binary && typeof download.content === 'string') throw new BadRequestException('Binary assets require a byte-capable sandbox backend')
    const bytes = typeof download.content === 'string' ? Buffer.from(download.content, 'utf8') : Buffer.from(download.content instanceof Uint8Array ? download.content : new Uint8Array(download.content))
    const content = binary ? bytes.toString('base64') : decodeSourceContent(download.content, decoder, file.relativePath)
    const size = bytes.length
    if (size > SITE_SOURCE_MAX_FILE_BYTES) {
      throw new BadRequestException(`Sites source file "${file.relativePath}" exceeds the ${SITE_SOURCE_MAX_FILE_BYTES} byte limit`)
    }
    totalBytes += size
    if (totalBytes > SITE_SOURCE_MAX_TOTAL_BYTES) {
      throw new BadRequestException(`Sites source directory exceeds the ${SITE_SOURCE_MAX_TOTAL_BYTES} byte total limit`)
    }
    return {
      path: file.relativePath,
      content,
      encoding: binary ? 'base64' : 'utf8',
      language: inferSourceLanguage(file.relativePath),
      role: inferSourceRole(file.relativePath)
    } satisfies SitesSourceFile
  })

  return {
    sourcePath,
    files: sourceFiles
  }
}

async function collectSandboxSourceEntries(backend: SitesSourceReadOptions['sandboxBackend'], sourcePath: string) {
  if (!backend) {
    return []
  }

  const batches = await Promise.all([
    Promise.resolve(backend.globInfo('*', sourcePath)),
    Promise.resolve(backend.globInfo('**/*', sourcePath))
  ])
  const entriesByPath = new Map<string, SitesSandboxFileInfo>()
  for (const entry of batches.flat()) {
    const key = `${normalizeSandboxPath(entry.path)}:${entry.is_dir ? 'dir' : 'file'}`
    if (!entriesByPath.has(key)) {
      entriesByPath.set(key, entry)
    }
  }
  return [...entriesByPath.values()]
}

function selectSandboxSourceFiles(entries: SitesSandboxFileInfo[], sourcePath: string, workingDirectory?: string) {
  const selected = entries
    .filter((entry) => !entry.is_dir)
    .map((entry): SandboxSourceCandidate | undefined => resolveSandboxSourceCandidate(entry, sourcePath, workingDirectory))
    .filter((entry): entry is SandboxSourceCandidate => Boolean(entry))
    .filter((entry) => isSupportedSourceFile(entry.relativePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  if (!selected.length) {
    throw new BadRequestException(
      'Sites sourcePath does not contain supported static source files. Create a root index.html plus optional .css, .js, .mjs, .json, .svg, .txt, .md, or .webmanifest files under sourcePath.'
    )
  }
  if (selected.length > SITE_SOURCE_MAX_FILES) {
    throw new BadRequestException(`Sites sourcePath contains ${selected.length} supported files; the limit is ${SITE_SOURCE_MAX_FILES}`)
  }
  const oversized = selected.find((entry) => typeof entry.size === 'number' && entry.size > SITE_SOURCE_MAX_FILE_BYTES)
  if (oversized) {
    throw new BadRequestException(`Sites source file "${oversized.relativePath}" exceeds the ${SITE_SOURCE_MAX_FILE_BYTES} byte limit`)
  }
  if (!selected.some((entry) => entry.relativePath === 'index.html')) {
    throw new BadRequestException('Sites sourcePath must contain a root index.html file')
  }
  return selected
}

function resolveSandboxSourceCandidate(
  entry: SitesSandboxFileInfo,
  sourcePath: string,
  workingDirectory?: string
): SandboxSourceCandidate | undefined {
  const normalizedPath = normalizeSandboxPath(entry.path)
  let absolutePath: string
  let relativePath: string | undefined

  if (posix.isAbsolute(normalizedPath)) {
    absolutePath = normalizedPath
    relativePath = relativeSandboxPath(absolutePath, sourcePath)
  } else {
    const workingRoot = optionalString(workingDirectory)
    if (workingRoot) {
      const resolvedFromWorkingRoot = posix.resolve(normalizeSandboxPath(workingRoot), normalizedPath)
      const relativeFromWorkingRoot = relativeSandboxPath(resolvedFromWorkingRoot, sourcePath)
      if (relativeFromWorkingRoot) {
        absolutePath = resolvedFromWorkingRoot
        relativePath = relativeFromWorkingRoot
        return typeof entry.size === 'number' ? { absolutePath, relativePath, size: entry.size } : { absolutePath, relativePath }
      }
    }
    try {
      relativePath = normalizeArtifactPath(normalizedPath)
      absolutePath = posix.join(sourcePath, relativePath)
    } catch {
      return undefined
    }
  }

  if (!relativePath) {
    return undefined
  }

  return typeof entry.size === 'number' ? { absolutePath, relativePath, size: entry.size } : { absolutePath, relativePath }
}

function resolveSandboxSourcePath(sourcePathInput: string | undefined, workingDirectory?: string) {
  const sourcePath = optionalString(sourcePathInput)
  if (!sourcePath) {
    throw new BadRequestException('sourcePath is required to save a Sites version')
  }

  const normalizedSourcePath = normalizeSandboxPath(sourcePath)
  if (posix.isAbsolute(normalizedSourcePath)) {
    if (workingDirectory) {
      const relative = posix.relative(normalizeSandboxPath(workingDirectory), normalizedSourcePath)
      if (relative === '..' || relative.startsWith('../')) throw new BadRequestException('sourcePath must stay inside the sandbox working directory')
    }
    return posix.normalize(normalizedSourcePath)
  }

  const normalizedWorkingDirectory = optionalString(workingDirectory)
  if (!normalizedWorkingDirectory) {
    throw new BadRequestException('Relative sourcePath requires a sandbox working directory')
  }
  const workingRoot = posix.normalize(normalizeSandboxPath(normalizedWorkingDirectory))
  const resolved = posix.resolve(workingRoot, normalizedSourcePath)
  const relativeToWorkingRoot = posix.relative(workingRoot, resolved)
  if (relativeToWorkingRoot === '..' || relativeToWorkingRoot.startsWith('../')) {
    throw new BadRequestException('sourcePath must stay inside the sandbox working directory')
  }
  return resolved
}

function relativeSandboxPath(filePath: string, sourcePath: string) {
  const relativePath = posix.relative(normalizeSandboxPath(sourcePath), normalizeSandboxPath(filePath))
  if (!relativePath || relativePath === '.' || relativePath === '..' || relativePath.startsWith('../')) {
    return undefined
  }
  return normalizeArtifactPath(relativePath)
}

function normalizeSandboxPath(value: string) {
  return posix.normalize(value.replace(/\\/g, '/'))
}

function normalizeArtifactPath(value: string) {
  const normalized = posix.normalize(value.replace(/\\/g, '/').replace(/^\.\/+/, ''))
  if (!normalized || normalized === '.' || posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new BadRequestException(`Invalid Sites source file path "${value}"`)
  }
  return normalized
}

function isSupportedSourceFile(relativePath: string) {
  const segments = relativePath.split('/')
  if (segments.some((segment) => SITE_SOURCE_EXCLUDED_SEGMENTS.has(segment))) {
    return false
  }
  return SITE_SOURCE_ALLOWED_EXTENSIONS.has(posix.extname(relativePath).toLowerCase())
}

function decodeSourceContent(content: Uint8Array | ArrayBuffer | string, decoder: TextDecoder, relativePath: string) {
  if (typeof content === 'string') {
    assertTextSource(content, relativePath)
    return content
  }
  try {
    const text = decoder.decode(content instanceof Uint8Array ? content : new Uint8Array(content))
    assertTextSource(text, relativePath)
    return text
  } catch {
    throw new BadRequestException(`Sites source file "${relativePath}" must be valid UTF-8 text`)
  }
}

function assertTextSource(content: string, relativePath: string) {
  if (content.includes('\u0000')) {
    throw new BadRequestException(`Sites source file "${relativePath}" appears to be binary; only text static assets are supported`)
  }
}

function inferSourceLanguage(path: string) {
  const extension = posix.extname(path).toLowerCase()
  if (extension === '.html') return 'html'
  if (extension === '.css') return 'css'
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'javascript'
  if (extension === '.json' || extension === '.webmanifest') return 'json'
  if (extension === '.svg') return 'svg'
  if (extension === '.md') return 'markdown'
  return 'text'
}

function inferSourceRole(path: string): SitesSourceFile['role'] {
  const extension = posix.extname(path).toLowerCase()
  if (path === 'index.html') return 'entry'
  if (extension === '.css') return 'style'
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'script'
  if (extension === '.json' || extension === '.webmanifest') return 'config'
  return 'asset'
}

export function sanitizeSourceFiles(files: SitesSourceFile[]) {
  const normalized = files
    .map((file) => ({
      path: normalizeArtifactPath(optionalString(file.path) ?? 'index.html'),
      encoding: file.encoding ?? 'utf8',
      content: typeof file.content === 'string' ? file.content : '',
      language: optionalString(file.language),
      role: file.role
    }))
    .filter((file) => file.content.trim())
  if (!normalized.length) {
    throw new BadRequestException('At least one source file with content is required')
  }
  if (!normalized.some((file) => file.path === 'index.html')) {
    throw new BadRequestException('Sites sourcePath must contain a root index.html file')
  }
  return normalized
}


function optionalString(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
