import { tool } from '@langchain/core/tools'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import JSZip from 'jszip'

export function buildZipTool() {
  return tool(
    async (input) => {
      try {
        const { files, file_name } = input
        
        if (!files || !Array.isArray(files) || files.length === 0) {
          return "Error: No files provided"
        }

        const zip = new JSZip()
        
        // Add each file to the zip
        for (const file of files) {
          if (file && file.content) {
            const fileName = file.name || file.filename || 'file'
            zip.file(fileName, file.content)
          }
        }

        // Generate zip file
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
        const zipArrayBuffer = await zipBlob.arrayBuffer()
        const zipBuffer = Buffer.from(zipArrayBuffer)
        
        const fileName = file_name && file_name.endsWith('.zip') 
          ? file_name 
          : `${file_name || 'files'}.zip`

        // Return base64 encoded zip file as string
        return JSON.stringify({
          blob: zipBuffer.toString('base64'),
          mime_type: 'application/zip',
          filename: fileName
        })
      } catch (error) {
        return "Error creating zip file: " + getErrorMessage(error)
      }
    },
    {
      name: 'zip',
      description: `Compress multiple files into a zip file. The input should include an array of files and an optional file name for the zip file.`,
      schema: z.object({
        files: z.array(z.object({
          name: z.string().optional(),
          filename: z.string().optional(),
          content: z.union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)]).describe('File content')
        })).describe('The files you want to zip'),
        file_name: z.string().optional().describe('The name of the zip file, default is "files.zip"')
      })
    }
  )
}

