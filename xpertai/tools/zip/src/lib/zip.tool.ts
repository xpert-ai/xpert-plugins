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
        let { files, fileName } = input
        
        const currentState = getCurrentTaskInput()
        const workspacePath = currentState?.[`sys`]?.['volume'] ?? '/tmp/xpert'
        const baseUrl = currentState?.[`sys`]?.['workspace_url'] ?? 'http://localhost:3000'

        // Validate files input
        if ((!files || !Array.isArray(files) || files.length === 0) ) {
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

        // Generate zip file
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
        
        // Determine output file name: ensure it ends with .zip
        const outputFileName = fileName?.endsWith('.zip') 
          ? fileName 
          : `${fileName || 'files'}.zip`

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
        
        return [
          `Created zip file: ${outputFileName}`,
          {
            files: [{
              mimeType: 'application/zip',
              fileName: outputFileName,
              filePath: responseFilePath,
              fileUrl: responseFileUrl,
              extension: 'zip'
            }]
          }
        ]
      } catch (error) {
        return "Error creating zip file: " + getErrorMessage(error)
      }
    },
    {
      name: 'zip',
      description: `Compress multiple files into a zip file. The input should include an array of files or a single file from various sources.`,
      schema: z.object({
        files: z.any().optional().nullable().describe('The files list you want to zip'),
        fileName: z.string().optional().nullable().describe('Zipped file name')
      }),
      responseFormat: 'content_and_artifact'
    }
  )
}
