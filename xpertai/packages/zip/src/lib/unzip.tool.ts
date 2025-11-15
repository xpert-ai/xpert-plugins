import { tool } from '@langchain/core/tools'
import { getCurrentTaskInput } from '@langchain/langgraph'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import JSZip from 'jszip'
import path from 'path'
import fs from 'fs/promises'

// MIME type mapping for common file extensions
const additionalMimeTypes: Record<string, string> = {
  // Document Type
  'md': 'text/markdown',
  'markdown': 'text/markdown',
  'rst': 'text/x-rst',
  'tex': 'application/x-tex',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Code Type
  'py': 'text/x-python',
  'js': 'application/javascript',
  'jsx': 'text/jsx',
  'ts': 'application/typescript',
  'tsx': 'text/tsx',
  'json': 'application/json',
  'yaml': 'application/x-yaml',
  'yml': 'application/x-yaml',
  'toml': 'application/toml',
  'ini': 'text/plain',
  'cfg': 'text/plain',
  'conf': 'text/plain',
  'sh': 'application/x-sh',
  'bat': 'application/x-bat',
  'ps1': 'application/x-powershell',
  
  // Image Type
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  
  // Others
  'csv': 'text/csv',
  'log': 'text/plain',
  'env': 'text/plain',
  'gitignore': 'text/plain',
  'npmrc': 'text/plain',
  'lock': 'text/plain',
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

async function extractZipEntries(zip: JSZip, outputDir: string): Promise<ExtractedFileInfo[]> {
  const entries = Object.entries(zip.files)
  const perEntryResults = await Promise.all(entries.map(async ([fileName, zipEntry]) => {
    if (zipEntry.dir) {
      return []
    }

    const fileContent = await zipEntry.async('nodebuffer')
    const fullPath = path.join(outputDir, fileName)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, fileContent)

    const files: ExtractedFileInfo[] = [{
      mimeType: getMimeType(fileName),
      fileName,
      filePath: fullPath,
      extension: path.extname(fileName).slice(1) || undefined,
    }]

    if (isZipFile(fileName)) {
      const nestedZip = await JSZip.loadAsync(fileContent)
      const parsed = path.parse(fullPath)
      const nestedDir = path.join(parsed.dir, parsed.name)
      await fs.mkdir(nestedDir, { recursive: true })
      const nestedResults = await extractZipEntries(nestedZip, nestedDir)
      files.push(...nestedResults)
    }

    return files
  }))

  return perEntryResults.flat()
}

export function buildUnzipTool() {
  return tool(
    async (input) => {
      try {
        const { fileUrl, filePath } = input
        let { fileName, content } = input
        
        if (!fileUrl && !filePath && !input.content) {
          return "Error: No file provided"
        }
        const currentState = getCurrentTaskInput()
        const workspacePath = currentState?.[`sys`]?.['workspace_path'] ?? '/tmp/xpert'

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
          return "Error: Invalid file content format"
        }

        // Load zip file
        const zip = await JSZip.loadAsync(zipBuffer)
        let subPath = ''
        if (fileName) {
          subPath = fileName.replace(ZIP_FILE_REGEX, '')
        }

        const results = await extractZipEntries(zip, subPath ? path.join(workspacePath, subPath) : workspacePath)

        if (results.length === 0) {
          return "Error: Zip file is empty or contains only directories"
        }

        return JSON.stringify({
          files: results
        })
      } catch (error) {
        if (error instanceof Error && error.message.includes('corrupted')) {
          return "Error: Not a valid zip file provided"
        }
        return "Error extracting zip file: " + getErrorMessage(error)
      }
    },
    {
      name: 'unzip',
      description: `Extract files from a zip file. The input should be a zip file. Returns an array of extracted files.`,
      schema: z.object({
          fileName: z.string().optional().nullable(),
          filePath: z.string().optional().nullable(),
          fileUrl: z.string().optional().nullable(),
          content: z.union([
            z.string(),
            z.instanceof(Buffer),
            z.instanceof(Uint8Array)
          ]).optional().nullable(),
      })
    }
  )
}
