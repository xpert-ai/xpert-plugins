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

export function buildUnzipTool() {
  return tool(
    async (input) => {
      try {
        const { fileUrl, filePath } = input
        let { content } = input
        
        if (!fileUrl && !filePath && !input.content) {
          return "Error: No file provided"
        }
        const currentState = getCurrentTaskInput()
        const workspacePath = currentState[`sys.workspace_path`]

        if (fileUrl) {
          // download file from URL to workspace
          const downloadResponse = await fetch(fileUrl)
          if (!downloadResponse.ok) {
            return `Error: Failed to download file from URL: ${downloadResponse.statusText}`
          }
          const arrayBuffer = await downloadResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          content = buffer
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
        
        const results: Array<{
          mimeType: string
          fileName: string
          fileUrl?: string
          filePath?: string
        }> = []

        // Extract each file
        for (const [fileName, zipEntry] of Object.entries(zip.files)) {
          // Skip directories
          if (zipEntry.dir) {
            continue
          }

          const fileContent = await zipEntry.async('nodebuffer')
          const mimeType = getMimeType(fileName)

          // Save fileContent into workspacePath
          const fullPath = path.join(workspacePath, fileName)
          const dirPath = path.dirname(fullPath)
          await fs.mkdir(dirPath, { recursive: true })
          await fs.writeFile(fullPath, fileContent)

          results.push({
            mimeType: mimeType,
            fileName: fileName,
            filePath: fullPath,
          })
        }

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
