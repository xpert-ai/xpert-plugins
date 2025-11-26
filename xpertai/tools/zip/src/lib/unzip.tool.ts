import { tool } from '@langchain/core/tools'
import { getCurrentTaskInput } from '@langchain/langgraph'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import JSZip from 'jszip'
import * as path from 'path'
import * as fs from 'fs/promises'
import { TFileInfo } from './types.js'

// MIME type mapping for common file extensions
const additionalMimeTypes: Record<string, string> = {
  // Text Files
  txt: 'text/plain',
  text: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  rst: 'text/x-rst',
  rtf: 'application/rtf',

  // Document Type
  tex: 'application/x-tex',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',

  // Code Type
  py: 'text/x-python',
  pyw: 'text/x-python',
  js: 'application/javascript',
  mjs: 'application/javascript',
  jsx: 'text/jsx',
  ts: 'application/typescript',
  tsx: 'text/tsx',
  json: 'application/json',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  toml: 'application/toml',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  scss: 'text/x-scss',
  sass: 'text/x-sass',
  less: 'text/x-less',
  ini: 'text/plain',
  cfg: 'text/plain',
  conf: 'text/plain',
  config: 'text/plain',
  sh: 'application/x-sh',
  bash: 'application/x-sh',
  zsh: 'application/x-sh',
  bat: 'application/x-bat',
  cmd: 'application/x-bat',
  ps1: 'application/x-powershell',
  psm1: 'application/x-powershell',
  psd1: 'application/x-powershell',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  cc: 'text/x-c++',
  cxx: 'text/x-c++',
  h: 'text/x-c',
  hpp: 'text/x-c++',
  hxx: 'text/x-c++',
  cs: 'text/x-csharp',
  php: 'application/x-php',
  rb: 'text/x-ruby',
  pl: 'application/x-perl',
  pm: 'application/x-perl',
  swift: 'text/x-swift',
  kt: 'text/x-kotlin',
  scala: 'text/x-scala',
  lua: 'text/x-lua',
  r: 'text/x-r',
  sql: 'application/sql',
  vue: 'text/x-vue',
  svelte: 'text/x-svelte',

  // Image Type
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',

  // Audio Type
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',

  // Video Type
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  webm: 'video/webm',
  mkv: 'video/x-matroska',

  // Archive Type
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',

  // Others
  csv: 'text/csv',
  log: 'text/plain',
  env: 'text/plain',
  gitignore: 'text/plain',
  npmrc: 'text/plain',
  lock: 'text/plain',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject'
}

function getMimeType(fileName: string): string {
  // Try to get MIME type from extension
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext && additionalMimeTypes[ext]) {
    return additionalMimeTypes[ext]
  }

  // Default MIME type
  return 'application/octet-stream'
}

const ZIP_FILE_REGEX = /\.zip$/i

function isZipFile(fileName: string) {
  return ZIP_FILE_REGEX.test(fileName)
}

/**
 * Properly encode file path for use in URLs
 * Encodes each path segment separately to handle special characters
 * Normalizes path separators to forward slashes for URLs
 */
function encodeFileUrl(relativePath: string, baseUrl: string): string {
  // Normalize path separators to forward slashes (Windows compatibility)
  const normalizedPath = relativePath.replace(/\\/g, '/')
  // Split the path into segments, filter out empty segments, and encode each one
  const segments = normalizedPath
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => encodeURIComponent(segment))
  const encodedPath = segments.join('/')
  return new URL(encodedPath, baseUrl).href
}

async function extractZipEntries(
  zip: JSZip,
  outputDir: string,
  outputUrl: string,
  basePath = '',
  depth = 0,
  maxDepth = 10
): Promise<TFileInfo[]> {
  // Preventing infinite recursion
  if (depth > maxDepth) {
    console.warn(`Warning: Maximum extraction depth (${maxDepth}) reached. Stopping recursion.`)
    return []
  }

  const entries = Object.entries(zip.files)
  const perEntryResults = await Promise.all(
    entries.map(async ([fileName, zipEntry]) => {
      if (zipEntry.dir) {
        return []
      }

      const fileContent = await zipEntry.async('nodebuffer')
      // Construct relative path with respect to the original zip
      const relativePath = basePath ? path.join(basePath, fileName) : fileName
      const fullPath = path.join(outputDir, relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })

      const files: TFileInfo[] = []

      // If it's a zip file, recursively extract without saving the original zip file
      if (isZipFile(fileName)) {
        try {
          const nestedZip = await JSZip.loadAsync(fileContent)
          // Extract to a directory named after the zip file (without extension)
          // const zipNameWithoutExt = fileName.replace(ZIP_FILE_REGEX, '')
          const zipFolder = path.dirname(fileName) // Extract to the current directory
          const nestedBasePath = basePath ? path.join(basePath, zipFolder) : zipFolder
          const nestedDir = path.join(outputDir, nestedBasePath)
          await fs.mkdir(nestedDir, { recursive: true })

          // Recursively extract nested zip files
          const nestedResults = await extractZipEntries(
            nestedZip,
            outputDir,
            outputUrl,
            nestedBasePath,
            depth + 1,
            maxDepth
          )
          files.push(...nestedResults)
        } catch (error) {
          // If nested zip extraction fails, save the original zip file
          console.warn(`Warning: Failed to extract nested zip file ${fileName}: ${getErrorMessage(error)}`)
          await fs.writeFile(fullPath, fileContent)
          files.push({
            mimeType: getMimeType(fileName),
            fileName: relativePath,
            filePath: fullPath,
            fileUrl: encodeFileUrl(relativePath, outputUrl),
            extension: path.extname(fileName).slice(1) || undefined
          })
        }
      } else {
        // If it's not a zip file, save it directly
        await fs.writeFile(fullPath, fileContent)
        files.push({
          mimeType: getMimeType(fileName),
          fileName: relativePath,
          filePath: fullPath,
          fileUrl: encodeFileUrl(relativePath, outputUrl),
          extension: path.extname(fileName).slice(1) || undefined
        })
      }

      return files
    })
  )

  return perEntryResults.flat()
}

export function buildUnzipTool() {
  return tool(
    async (input) => {
      try {
        const { fileUrl, filePath } = input
        let { fileName, content } = input

        if (!fileUrl && !filePath && !input.content) {
          throw new Error('No file provided')
        }
        const currentState = getCurrentTaskInput()
        const workspacePath = currentState?.[`sys`]?.['volume'] ?? '/tmp/xpert'

        if (fileUrl) {
          // download file from URL to workspace
          const downloadResponse = await fetch(fileUrl)
          if (!downloadResponse.ok) {
            return `Error: Failed to download file from URL: ${downloadResponse.statusText}`
          }
          const arrayBuffer = await downloadResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          content = buffer

          if (!fileName) {
            fileName = path.basename(new URL(fileUrl).pathname)
          }
        }

        // Handle file from local path
        if (filePath) {
          try {
            const fileContent = await fs.readFile(filePath)
            content = fileContent

            if (!fileName) {
              fileName = path.basename(filePath)
            }
          } catch (error) {
            return `Error: Failed to read file from path: ${getErrorMessage(error)}`
          }
        }

        // Get file content
        let zipBuffer: Buffer
        if (typeof content === 'string') {
          // If content is base64 string
          zipBuffer = Buffer.from(content, 'base64')
        } else if (Buffer.isBuffer(content)) {
          zipBuffer = content
        } else if (content instanceof Uint8Array) {
          zipBuffer = Buffer.from(content)
        } else {
          throw new Error('Invalid file content format')
        }

        // Load zip file
        const zip = await JSZip.loadAsync(zipBuffer)
        let subPath = ''
        if (fileName) {
          subPath = fileName.replace(ZIP_FILE_REGEX, '')
        }

        // Start recursive extraction, do not keep intermediate zip files
        const baseUrl = currentState?.[`sys`]?.['workspace_url']
        // Encode subPath for URL to handle special characters in zip file name
        const encodedSubPath = subPath ? encodeURIComponent(subPath) + '/' : ''
        const results = await extractZipEntries(
          zip,
          subPath ? path.join(workspacePath, subPath) : workspacePath,
          new URL(encodedSubPath, baseUrl).href,
          '', // basePath starts from an empty string
          0, // depth starts from 0
          10 // maxDepth is 10 to prevent infinite recursion
        )

        if (results.length === 0) {
          throw new Error('Zip file is empty or contains only directories')
        }

        return [
          `Extracted ${results.length} files from zip file: ${fileName || 'unknown'}`,
          {
            files: results
          }
        ]
      } catch (error) {
        if (error instanceof Error && error.message.includes('corrupted')) {
          throw new Error('Not a valid zip file provided')
        }
        return 'Error extracting zip file: ' + getErrorMessage(error)
      }
    },
    {
      name: 'unzip',
      description: `Extract files from a zip file. The input should be a zip file. Returns an array of extracted files.`,
      schema: z.object({
        fileName: z.string().optional().nullable(),
        filePath: z.string().optional().nullable(),
        fileUrl: z.string().optional().nullable(),
        content: z
          .union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)])
          .optional()
          .nullable()
      }),
      responseFormat: 'content_and_artifact'
    }
  )
}
