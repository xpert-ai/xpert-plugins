import { tool } from '@langchain/core/tools'
import { getCurrentTaskInput } from '@langchain/langgraph'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { withPdfiumPages } from './converter.js'

const fileSchema = z.object({
  fileName: z.string().nullish(),
  fileUrl: z.string().nullish(),
  filePath: z.string().nullish()
})
type PdfToolArtifact = {
  fileName: string
  filePath: string
  fileUrl?: string
  mimeType: string
  page?: number
}

export function buildPdfToMarkdownTool() {
  return tool(
    async (input, config) => {
      if (!input.file && !input.fileUrl && !input.filePath && !input.content) throw new Error('No PDF file provided')
      const fileInput = input.file ?? { fileName: input.fileName, fileUrl: input.fileUrl, filePath: input.filePath }
      const files = Array.isArray(fileInput) ? fileInput : [fileInput]
      const state = getCurrentTaskInput()
      const workspacePath: string = state?.['sys']?.['volume'] ?? '/tmp/xpert'
      const baseUrl: string | undefined = state?.['sys']?.['workspace_url']
      const artifacts: PdfToolArtifact[] = []
      const contents: string[] = []
      await mkdir(workspacePath, { recursive: true })
      for (const file of files) {
        config.signal?.throwIfAborted()
        let buffer: Buffer
        let name = file.fileName
        if (file.fileUrl) {
          const response = await fetch(file.fileUrl, {
            signal: config.signal
              ? AbortSignal.any([config.signal, AbortSignal.timeout(120_000)])
              : AbortSignal.timeout(120_000)
          })
          if (!response.ok) throw new Error(`Failed to download PDF: HTTP ${response.status}`)
          buffer = Buffer.from(await response.arrayBuffer())
          name ||= path.basename(new URL(file.fileUrl).pathname)
        } else if (file.filePath) {
          buffer = await readFile(file.filePath)
          name ||= path.basename(file.filePath)
        } else if (typeof input.content === 'string') {
          buffer = Buffer.from(input.content, 'base64')
        } else if (input.content) {
          buffer = Buffer.from(input.content)
        } else {
          throw new Error('Invalid PDF content format')
        }
        name ||= 'document.pdf'
        // Atomically allocate persistent outputs independently of filenames and concurrent calls.
        const outputDir = await mkdtemp(path.join(workspacePath, 'pdf-'))
        const group = path.basename(outputDir)
        const imageArtifacts: PdfToolArtifact[] = []
        const markdown = await withPdfiumPages(
          buffer,
          {
            scale: typeof input.scale === 'number' && input.scale > 0 ? input.scale : undefined,
            signal: config.signal
          },
          async (pages, directory) => {
            let content = `# PDF Converted to Markdown\n\n> Source File: ${name}\n\n> Pages: ${pages.length}\n\n`
            for (const page of pages) {
              config.signal?.throwIfAborted()
              const filePath = path.join(outputDir, page.imageName)
              await writeFile(filePath, await readFile(path.join(directory, page.imageName)))
              content += `## Page ${page.page}\n\n![Page ${page.page}](${page.imageName})\n\n`
              content += page.text
                ? `### Extracted Text\n\n${page.text}\n\n`
                : '> (No extractable text, maybe scanned page)\n\n'
              imageArtifacts.push({
                fileName: path.join(group, page.imageName),
                filePath,
                fileUrl: assetUrl(group, page.imageName, baseUrl),
                mimeType: 'image/png',
                page: page.page
              })
            }
            return content
          }
        )
        const markdownPath = path.join(outputDir, 'result.md')
        await writeFile(markdownPath, markdown, 'utf8')
        artifacts.push(
          {
            fileName: path.join(group, 'result.md'),
            filePath: markdownPath,
            fileUrl: assetUrl(group, 'result.md', baseUrl),
            mimeType: 'text/markdown'
          },
          ...imageArtifacts
        )
        contents.push(markdown)
      }
      return [contents.join('\n\n'), { files: artifacts }]
    },
    {
      name: 'pdf_to_markdown',
      description:
        'Convert a PDF file into a markdown file with extracted text and rendered page images. Returns markdown and images file list.',
      schema: z.object({
        file: z
          .union([fileSchema, z.array(fileSchema).min(1)])
          .nullish()
          .describe('File object or list of File objects'),
        fileName: z.string().nullish(),
        filePath: z.string().nullish(),
        fileUrl: z.string().nullish(),
        content: z.union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)]).nullish(),
        scale: z.number().nullish().describe('Rendering scale for images, default 2.0')
      }),
      responseFormat: 'content_and_artifact'
    }
  )
}

function assetUrl(group: string, name: string, baseUrl?: string) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(group)}/${encodeURIComponent(name)}` : undefined
}
