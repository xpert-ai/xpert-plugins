import { tool } from '@langchain/core/tools'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import JSZip from 'jszip';
import { getCurrentTaskInput } from '@langchain/langgraph'
import * as path from 'path'
import * as fs from 'fs/promises'

export function buildZipTool() {
  return tool(
    async (input) => {
      try {
        let { files, fileName: file_name, filePath: inputFilePath, fileUrl: inputFileUrl, content } = input as any
        
        const currentState = getCurrentTaskInput()
        const workspacePath = currentState?.[`sys`]?.['volume'] ?? '/tmp/xpert'
        const baseUrl = currentState?.[`sys`]?.['workspace_url'] ?? 'http://localhost:3000'

        // Handle file from URL
        if (inputFileUrl) {
          const downloadResponse = await fetch(inputFileUrl)
          if (!downloadResponse.ok) {
            return `Error: Failed to download file from URL: ${downloadResponse.statusText}`
          }
          const arrayBuffer = await downloadResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          content = buffer

          if (!file_name) {
            file_name = path.basename(new URL(inputFileUrl).pathname)
          }
        }

        // Handle file from local path
        if (inputFilePath) {
          try {
            const fullPath = path.join(workspacePath, inputFilePath)
            const fileContent = await fs.readFile(fullPath)
            content = fileContent

            if (!file_name) {
              file_name = path.basename(inputFilePath)
            }
          } catch (error) {
            return `Error: Failed to read file from path: ${getErrorMessage(error)}`
          }
        }

        // Validate files input
        if ((!files || !Array.isArray(files) || files.length === 0) && !content) {
          return "Error: No files provided"
        }

        const zip = new JSZip()
        
        // Add files from array
        if (files && Array.isArray(files) && files.length > 0) {
          for (const file of files) {
            if (file && file.content) {
              const fileName = file.name || file.filename || 'file'
              zip.file(fileName, file.content)
            }
          }
        }
        // Add single file content
        else if (content) {
          // Handle different content types
          let fileContent: string | Uint8Array | Buffer
          if (typeof content === 'string') {
            // Check if it's base64 encoded
            try {
              fileContent = Buffer.from(content, 'base64')
            } catch {
              fileContent = content
            }
          } else {
            fileContent = content
          }
          
          // Use original file name without .zip extension for the content inside zip
          const internalFileName = file_name?.endsWith('.zip') 
            ? file_name.slice(0, -4) 
            : (file_name || 'file')
          zip.file(internalFileName, fileContent)
        }

        // Generate zip file
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
        
        // Determine output file name: ensure it ends with .zip
        const outputFileName = file_name?.endsWith('.zip') 
          ? file_name 
          : `${file_name || 'files'}.zip`

        // Prepare response paths
        const responseFilePath = path.join(workspacePath, outputFileName)
        const responseFileUrl = new URL(outputFileName, baseUrl).href
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(responseFilePath), { recursive: true })
        
        // Save the zip file to disk
        try {
          await fs.writeFile(responseFilePath, zipBuffer)
        } catch (writeError) {
          return `Error: Failed to write zip file: ${getErrorMessage(writeError)} - Path: ${responseFilePath}`
        }
        
        return JSON.stringify({
          files: [{
            mimeType: 'application/zip',
            fileName: outputFileName,
            filePath: responseFilePath,
            fileUrl: responseFileUrl,
            extension: 'zip'
          }]
        })
      } catch (error) {
        return "Error creating zip file: " + getErrorMessage(error)
      }
    },
    {
      name: 'zip',
      description: `Compress multiple files into a zip file. The input should include an array of files or a single file from various sources.`,
      schema: z.object({
        files: z.array(z.object({
          name: z.string().optional(),
          filename: z.string().optional(),
          content: z.union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)]).describe('File content')
        })).optional().describe('The files you want to zip'),
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

