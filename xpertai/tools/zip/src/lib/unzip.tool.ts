import { tool } from '@langchain/core/tools'
import { getCurrentTaskInput } from '@langchain/langgraph'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import JSZip from 'jszip'
import * as path from 'path'
import * as fs from 'fs/promises'
import iconv from 'iconv-lite'

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

type ExtractedFileInfo = {
  mimeType: string
  fileName: string
  fileUrl?: string
  filePath: string
  extension?: string
}

const ZIP_FILE_REGEX = /\.zip$/i

function isZipFile(fileName: string) {
  return ZIP_FILE_REGEX.test(fileName)
}

/**
 * 创建一个兼容多种编码的文件名解码器
 * 支持 UTF-8、GBK、GB2312、Big5、Shift-JIS、EUC-KR 等常见编码
 * @param bytes 原始字节数据
 * @returns 解码后的文件名
 */
function createUniversalDecoder(bytes: Uint8Array | Buffer | string[]): string {
  // 定义要尝试的编码列表（按优先级排序）
  const encodings = [
    'utf-8',        // 标准 UTF-8（优先）
    'gbk',          // 简体中文 Windows
    'gb2312',       // 简体中文
    'big5',         // 繁体中文
    'shift_jis',    // 日文
    'euc-kr',       // 韩文
    'iso-8859-1',   // 西欧语言
    'windows-1251', // 俄语
    'windows-1252', // 西欧
  ]

  // 转换为 Buffer 以便统一处理
  let byteBuffer: Buffer
  if (Buffer.isBuffer(bytes)) {
    byteBuffer = bytes
  } else if (bytes instanceof Uint8Array) {
    byteBuffer = Buffer.from(bytes)
  } else {
    byteBuffer = Buffer.from(bytes.map(c => typeof c === 'string' ? c.charCodeAt(0) : c))
  }

  // 首先尝试 UTF-8（使用严格模式）
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
    const decoded = utf8Decoder.decode(new Uint8Array(byteBuffer))
    // 验证解码结果：不包含替换字符且不全是控制字符
    if (!decoded.includes('\ufffd') && decoded.trim().length > 0) {
      return decoded
    }
  } catch {
    // UTF-8 解码失败，继续尝试其他编码
  }

  // 依次尝试其他编码
  for (const encoding of encodings.slice(1)) {
    try {
      const decoded = iconv.decode(byteBuffer, encoding)
      // 验证解码结果
      if (decoded && !decoded.includes('\ufffd') && decoded.trim().length > 0) {
        // 额外检查：确保解码后的字符串合理（包含有效字符）
        // 支持：中文、日文、韩文、西欧字符、数字、字母等
        const hasValidChars = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\w\s.\-_()\[\]{}]/.test(decoded)
        if (hasValidChars) {
          return decoded
        }
      }
    } catch {
      // 该编码解码失败，继续下一个
      continue
    }
  }

  // 所有编码都失败，使用默认字符串表示
  const byteArray = Array.from(byteBuffer)
  return String.fromCharCode(...byteArray)
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
  basePath: string = '',
  depth: number = 0,
  maxDepth: number = 10
): Promise<ExtractedFileInfo[]> {
  // 防止无限递归
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

      // fileName 已经在 JSZip.loadAsync 时通过 createUniversalDecoder 正确解码
      const decodedFileName = fileName

      const fileContent = await zipEntry.async('nodebuffer')
      // 构建相对于原始zip的路径，使用解码后的文件名
      const relativePath = basePath ? path.join(basePath, decodedFileName) : decodedFileName
      const fullPath = path.join(outputDir, relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })

      const files: ExtractedFileInfo[] = []

      // 如果是zip文件，递归解压，不保存原始zip文件
      if (isZipFile(decodedFileName)) {
        try {
          // 嵌套 zip 也使用通用解码器
          const nestedZip = await JSZip.loadAsync(fileContent, {
            decodeFileName: createUniversalDecoder
          })
          // 解压到以zip文件名（不含扩展名）命名的目录
          // const zipNameWithoutExt = decodedFileName.replace(ZIP_FILE_REGEX, '')
          const zipFolder = path.dirname(decodedFileName) // 解压到当前目录下
          const nestedBasePath = basePath ? path.join(basePath, zipFolder) : zipFolder
          const nestedDir = path.join(outputDir, nestedBasePath)
          await fs.mkdir(nestedDir, { recursive: true })

          // 递归解压嵌套的zip文件
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
          // 如果嵌套zip解压失败，保存原始zip文件
          console.warn(`Warning: Failed to extract nested zip file ${decodedFileName}: ${getErrorMessage(error)}`)
          await fs.writeFile(fullPath, fileContent)
          files.push({
            mimeType: getMimeType(decodedFileName),
            fileName: relativePath,
            filePath: fullPath,
            fileUrl: encodeFileUrl(relativePath, outputUrl),
            extension: path.extname(decodedFileName).slice(1) || undefined
          })
        }
      } else {
        // 非zip文件，直接保存
        await fs.writeFile(fullPath, fileContent)
        files.push({
          mimeType: getMimeType(decodedFileName),
          fileName: relativePath,
          filePath: fullPath,
          fileUrl: encodeFileUrl(relativePath, outputUrl),
          extension: path.extname(decodedFileName).slice(1) || undefined
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
          return 'Error: No file provided'
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
            const fullPath = path.join(workspacePath, filePath)
            const fileContent = await fs.readFile(fullPath)
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
          return 'Error: Invalid file content format'
        }

        // Load zip file with universal filename decoder to handle multiple encodings
        const zip = await JSZip.loadAsync(zipBuffer, {
          // 自定义文件名解码器：支持 UTF-8、GBK、Big5、Shift-JIS、EUC-KR 等多种编码
          decodeFileName: createUniversalDecoder
        })
        let subPath = ''
        if (fileName) {
          subPath = fileName.replace(ZIP_FILE_REGEX, '')
        }

        // 开始递归解压，不保留中间zip文件
        const baseUrl = currentState?.[`sys`]?.['workspace_url']
        // Encode subPath for URL to handle special characters in zip file name
        const encodedSubPath = subPath ? encodeURIComponent(subPath) + '/' : ''
        const results = await extractZipEntries(
          zip,
          subPath ? path.join(workspacePath, subPath) : workspacePath,
          new URL(encodedSubPath, baseUrl).href,
          '', // basePath 从空字符串开始
          0, // depth 从0开始
          10 // maxDepth 最多10层，防止无限递归
        )

        if (results.length === 0) {
          return 'Error: Zip file is empty or contains only directories'
        }

        return [
          `Extracted ${results.length} files from zip file: ${fileName || 'unknown'}`,
          {
            files: results
          }
        ]
      } catch (error) {
        if (error instanceof Error && error.message.includes('corrupted')) {
          return 'Error: Not a valid zip file provided'
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
