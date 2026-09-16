import { Injectable } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  type IDocumentTransformerStrategy,
  type Permissions,
  type TDocumentAsset,
  type TDocumentTransformerConfig,
  type WorkspaceFileScope
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { AnyDocSandboxConverter } from './convert.js'
import { FILE_TYPES, Icon, documentExtension } from './types.js'

type Config = TDocumentTransformerConfig & { signal?: AbortSignal; fileScope?: WorkspaceFileScope }
type Documents = Parameters<IDocumentTransformerStrategy['transformDocuments']>[0]
type Results = Awaited<ReturnType<IDocumentTransformerStrategy['transformDocuments']>>
@Injectable()
@DocumentTransformerStrategy('anydoc')
export class AnyDocTransformerStrategy implements IDocumentTransformerStrategy<Config> {
  constructor(private readonly converter: AnyDocSandboxConverter) {}
  readonly permissions: Permissions = [{ type: 'filesystem', operations: ['read', 'write'], scope: [] }]
  readonly meta = {
    name: 'anydoc',
    label: { en_US: 'AnyDoc', zh_Hans: 'AnyDoc' },
    description: {
      en_US: 'Local document conversion using Sandbox Jobs. Scanned PDF pages use the configured image-understanding model.',
      zh_Hans: '通过平台沙箱本地转换文档；PDF 扫描页需开启图像理解并配置视觉模型。'
    },
    icon: Icon,
    supportedFileTypes: FILE_TYPES,
    providesImageText: false,
    configSchema: { type: 'object', properties: {} }
  }
  async validateConfig(config: Config) {
    config.signal?.throwIfAborted()
    await this.converter.checkHealth()
  }
  async transformDocuments(documents: Documents, config: Config): Promise<Results> {
    const fs = config.permissions?.fileSystem
    if (!fs) throw new Error('AnyDoc requires the scoped knowledge-base filesystem')
    const output: Results = []
    for (const document of documents) {
      config.signal?.throwIfAborted()
      const extension = documentExtension(document.type, document.mimeType)
      if (!document.filePath || !FILE_TYPES.includes(extension)) throw new Error('ANYDOC_UNSUPPORTED_FORMAT')
      const result = await this.converter.convert(document.filePath, extension, {
        signal: config.signal,
        fileScope: config.fileScope,
        documentId: document.id,
        stage: config.stage
      })
      const folder = 'anydoc/' + randomUUID()
      const assets: TDocumentAsset[] = []
      const references = new Map<string, string>()
      for (const asset of result.assets) {
        config.signal?.throwIfAborted()
        const filePath = `${folder}/${asset.name}`
        const url = await fs.writeFile(filePath, Buffer.from(asset.data, 'base64'))
        references.set(`xpert-asset://${asset.name}`, url)
        assets.push({
          type: /^(image\/(png|jpeg|gif|webp))$/.test(asset.mimeType) ? 'image' : 'file',
          filePath,
          url,
          order: assets.length,
          ...(asset.sourceType ? { sourceType: asset.sourceType } : {}),
          ...(asset.page ? { page: asset.page } : {})
        })
      }
      const replaceReferences = (text: string) =>
        text.replace(/xpert-asset:\/\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g, (match) => references.get(match) ?? match)
      const markdown = replaceReferences(result.markdown)
      const originalPath = `${folder}/result.md`
      assets.push({ type: 'file', filePath: originalPath, url: await fs.writeFile(originalPath, markdown) })
      const pages = result.pages ?? [{ page: undefined, markdown: result.markdown, status: 'text' as const }]
      const chunks = pages
        .filter((page) => page.markdown.trim())
        .map((page, index) => ({
          pageContent: replaceReferences(page.markdown),
          metadata: {
            chunkId: randomUUID(),
            chunkIndex: index,
            parser: 'anydoc',
            mediaType: page.status === 'needs-ocr' ? 'image' as const : 'text' as const,
            contentFormat: 'markdown' as const,
            ...(page.page ? { page: page.page } : {}),
            assets: assets.filter((asset) => asset.type === 'image' && (!page.page || asset.page === page.page))
          }
        }))
      output.push({
        id: document.id,
        chunks,
        metadata: {
          chunkId: randomUUID(),
          parser: 'anydoc',
          sandboxJobId: result.sandboxJobId,
          runtimeProfile: result.runtimeProfile,
          ...(result.pages ? {
            parserDiagnostics: {
              schemaVersion: 1,
              pages: result.pages.map((page) => ({
                page: page.page, status: page.status,
                imagePaths: assets.filter((asset) => asset.sourceType === 'pdf_page' && asset.page === page.page)
                  .map((asset) => asset.filePath)
              }))
            }
          } : {}),
          assets
        }
      })
    }
    return output
  }
}
