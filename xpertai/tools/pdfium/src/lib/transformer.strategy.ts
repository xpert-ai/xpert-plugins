import { Injectable } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  type IDocumentTransformerStrategy,
  type Permissions,
  type TDocumentAsset,
  type TDocumentTransformerConfig
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PdfiumOptionsSchema, withPdfiumPages } from './converter.js'
import { icon } from './types.js'

type PdfiumTransformConfig = TDocumentTransformerConfig & { scale?: number; signal?: AbortSignal }

type TransformerDocuments = Parameters<IDocumentTransformerStrategy['transformDocuments']>[0]
type TransformedDocuments = Awaited<ReturnType<IDocumentTransformerStrategy['transformDocuments']>>

@Injectable()
@DocumentTransformerStrategy('pdfium')
export class PdfiumTransformerStrategy implements IDocumentTransformerStrategy<PdfiumTransformConfig> {
  readonly permissions: Permissions = [{ type: 'filesystem', operations: ['read', 'write'], scope: [] }]
  readonly meta = {
    name: 'pdfium',
    label: { en_US: 'PDFium', zh_Hans: 'PDFium' },
    description: {
      en_US: 'Extract PDF text and render page images locally. Scanned pages need image understanding for OCR.',
      zh_Hans: '本地提取 PDF 文字并渲染页面图片；扫描页需配合图像理解识别文字。'
    },
    icon: { type: 'svg' as const, value: icon },
    supportedFileTypes: ['pdf'],
    providesImageText: false,
    configSchema: { type: 'object', properties: {} }
  }

  async validateConfig(config: PdfiumTransformConfig): Promise<void> {
    PdfiumOptionsSchema.parse(config)
  }

  async transformDocuments(
    documents: TransformerDocuments,
    config: PdfiumTransformConfig
  ): Promise<TransformedDocuments> {
    const fileSystem = config.permissions?.fileSystem
    if (!fileSystem) throw new Error('PDFium requires the knowledge-base file-system permission')
    const output: TransformedDocuments = []
    for (const document of documents) {
      config.signal?.throwIfAborted()
      if (document.type?.replace(/^\./, '').toLowerCase() !== 'pdf') throw new Error('PDFium only supports PDF files')
      if (!document.filePath) throw new Error('PDFium requires the uploaded original file')
      output.push(
        await withPdfiumPages(await fileSystem.readFile(document.filePath), config, async (pages, directory) => {
          const folder = `pdfium/${randomUUID()}`
          const assets: TDocumentAsset[] = []
          const chunks: NonNullable<TransformedDocuments[number]['chunks']> = []
          for (const page of pages) {
            config.signal?.throwIfAborted()
            const filePath = `${folder}/${page.imageName}`
            const url = await fileSystem.writeFile(filePath, await readFile(join(directory, page.imageName)))
            const asset: TDocumentAsset = {
              type: 'image',
              filePath,
              url,
              sourceType: 'pdf_page',
              page: page.page,
              order: page.page - 1
            }
            assets.push(asset)
            chunks.push({
              pageContent: page.text || `![Page ${page.page}](${url})`,
              metadata: {
                chunkId: randomUUID(),
                chunkIndex: page.page - 1,
                parser: 'pdfium',
                page: page.page,
                loc: { pageNumber: page.page },
                mediaType: page.text ? 'text' : 'image',
                contentFormat: page.text ? 'text' : 'markdown',
                assets: [asset]
              }
            })
          }
          const markdown = pages
            .map((page, index) => `## Page ${page.page}\n\n![Page ${page.page}](${assets[index].url})\n\n${page.text}`)
            .join('\n\n')
          const filePath = `${folder}/result.md`
          assets.push({ type: 'file', filePath, url: await fileSystem.writeFile(filePath, markdown) })
          return {
            id: document.id,
            chunks,
            metadata: { chunkId: randomUUID(), parser: 'pdfium', sourcePageCount: pages.length, assets }
          }
        })
      )
    }
    return output
  }
}
