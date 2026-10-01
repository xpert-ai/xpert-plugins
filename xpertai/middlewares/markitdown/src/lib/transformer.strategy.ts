import { Injectable } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  type IDocumentTransformerStrategy,
  type Permissions,
  type TDocumentAsset,
  type TDocumentTransformerConfig,
  type WorkspaceFileScope,
  type XpFileSystem
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { MarkItDownSandboxConverter, MARKITDOWN_FILE_TYPES } from './convert.js'
import { MarkItDownIcon } from './types.js'

type MarkItDownTransformConfig = TDocumentTransformerConfig & { signal?: AbortSignal; fileScope?: WorkspaceFileScope }

type TransformerDocuments = Parameters<IDocumentTransformerStrategy['transformDocuments']>[0]
type TransformedDocuments = Awaited<ReturnType<IDocumentTransformerStrategy['transformDocuments']>>

@Injectable()
@DocumentTransformerStrategy('markitdown')
export class MarkItDownTransformerStrategy implements IDocumentTransformerStrategy<MarkItDownTransformConfig> {
  constructor(private readonly converter: MarkItDownSandboxConverter) {}

  readonly permissions: Permissions = [{ type: 'filesystem', operations: ['read', 'write'], scope: [] }]
  readonly meta = {
    name: 'markitdown',
    label: { en_US: 'MarkItDown', zh_Hans: 'MarkItDown' },
    description: {
      en_US:
        'Convert documents to Markdown using platform-managed Sandbox Jobs. Scanned pages use the knowledge base image-understanding pipeline.',
      zh_Hans: '使用平台管理的沙箱任务将文档转换为 Markdown，扫描页交给知识库图像理解流程识别。'
    },
    icon: { type: 'svg' as const, value: MarkItDownIcon },
    supportedFileTypes: MARKITDOWN_FILE_TYPES,
    providesImageText: false,
    configSchema: { type: 'object', properties: {} }
  }

  async validateConfig(config: MarkItDownTransformConfig): Promise<void> {
    config.signal?.throwIfAborted()
    await this.converter.checkHealth()
  }

  async transformDocuments(
    documents: TransformerDocuments,
    config: MarkItDownTransformConfig
  ): Promise<TransformedDocuments> {
    const fileSystem = config.permissions?.fileSystem
    if (!fileSystem) throw new Error('MarkItDown requires the knowledge-base file-system permission')
    const output: TransformedDocuments = []
    for (const document of documents) {
      config.signal?.throwIfAborted()
      const extension = document.type?.replace(/^\./, '').toLowerCase()
      if (!extension || !MARKITDOWN_FILE_TYPES.includes(extension))
        throw new Error(`MarkItDown does not support this file type: ${document.type}`)
      if (!document.filePath) throw new Error('MarkItDown requires the uploaded original file')
      const result = await this.converter.convert(document.filePath, extension, {
        signal: config.signal,
        fileScope: config.fileScope,
        documentId: document.id,
        stage: config.stage
      })
      config.signal?.throwIfAborted()
      const folder = `markitdown/${randomUUID()}`
      const assets: TDocumentAsset[] = []
      const chunks: NonNullable<TransformedDocuments[number]['chunks']> = []
      const pages = []
      for (const page of result.pages ?? [
        { page: undefined, markdown: result.markdown, needsOcr: false, blank: false }
      ]) {
        const persisted = await persistImages(
          page.markdown,
          `${folder}/${page.page ?? 'document'}`,
          fileSystem,
          page.page
        )
        assets.push(...persisted.assets)
        if (page.page)
          pages.push({
            page: page.page,
            status: page.needsOcr ? 'needs-ocr' : page.blank ? 'blank' : 'text',
            imagePaths: persisted.assets.filter((asset) => asset.type === 'image').map((asset) => asset.filePath)
          })
        if (persisted.markdown.trim())
          chunks.push({
            pageContent: persisted.markdown,
            metadata: {
              chunkId: randomUUID(),
              chunkIndex: chunks.length,
              parser: 'markitdown',
              mediaType: 'text',
              contentFormat: 'markdown',
              assets: persisted.assets,
              ...(page.page ? { page: page.page } : {})
            }
          })
      }
      const markdown = chunks.map((chunk) => chunk.pageContent).join('\n\n')
      const markdownPath = `${folder}/result.md`
      assets.push({ type: 'file', filePath: markdownPath, url: await fileSystem.writeFile(markdownPath, markdown) })
      output.push({
        id: document.id,
        chunks,
        metadata: {
          chunkId: randomUUID(),
          parser: 'markitdown',
          sandboxJobId: result.sandboxJobId,
          runtimeProfile: result.runtimeProfile,
          ...(pages.length ? { parserDiagnostics: { schemaVersion: 1, pages } } : {}),
          assets,
          ...(result.title ? { title: result.title } : {})
        }
      })
    }
    return output
  }
}

async function persistImages(markdown: string, folder: string, fileSystem: XpFileSystem, page?: number) {
  const assets: TDocumentAsset[] = []
  const references = [...new Set(markdown.match(/data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+/g) ?? [])]
  for (const reference of references) {
    const [header, content] = reference.split(',')
    const extension = header.slice('data:image/'.length, header.indexOf(';'))
    const filePath = `${folder}/image-${assets.length + 1}.${extension}`
    const url = await fileSystem.writeFile(filePath, Buffer.from(content, 'base64'))
    assets.push({
      type: 'image',
      url,
      filePath,
      order: assets.length,
      ...(page ? { page, sourceType: 'pdf_page' } : {})
    })
    markdown = markdown.split(reference).join(url)
  }
  return { markdown, assets }
}
