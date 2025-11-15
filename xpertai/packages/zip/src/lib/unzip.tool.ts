import { tool } from '@langchain/core/tools'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import JSZip from 'jszip'

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
        const { file } = input
        
        if (!file) {
          return "Error: No file provided"
        }

        // Check if file is a zip file
        const fileName = file.name || file.filename || ''
        if (!fileName.toLowerCase().endsWith('.zip')) {
          return "Error: Not a zip file provided"
        }

        // Get file content
        let zipBuffer: Buffer
        if (typeof file.content === 'string') {
          // If content is base64 string
          zipBuffer = Buffer.from(file.content, 'base64')
        } else if (Buffer.isBuffer(file.content)) {
          zipBuffer = file.content
        } else if (file.content instanceof Uint8Array) {
          zipBuffer = Buffer.from(file.content)
        } else if (file.blob) {
          zipBuffer = Buffer.from(file.blob, 'base64')
        } else {
          return "Error: Invalid file content format"
        }

        // Load zip file
        const zip = await JSZip.loadAsync(zipBuffer)
        
        const results: Array<{
          blob: string
          mime_type: string
          filename: string
        }> = []

        // Extract each file
        for (const [fileName, zipEntry] of Object.entries(zip.files)) {
          // Skip directories
          if (zipEntry.dir) {
            continue
          }

          const fileContent = await zipEntry.async('nodebuffer')
          const mimeType = getMimeType(fileName)

          results.push({
            blob: fileContent.toString('base64'),
            mime_type: mimeType,
            filename: fileName
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
        file: z.object({
          name: z.string().optional(),
          filename: z.string().optional(),
          content: z.union([
            z.string(),
            z.instanceof(Buffer),
            z.instanceof(Uint8Array)
          ]).optional(),
          blob: z.string().optional()
        }).describe('The zip file you want to unzip')
      })
    }
  )
}

