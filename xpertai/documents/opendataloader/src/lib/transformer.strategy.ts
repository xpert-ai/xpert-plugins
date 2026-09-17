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
import { OpenDataLoaderSandboxConverter } from './convert.js'
import { FILE_TYPES, Icon, ParserConfigSchema, type OpenDataLoaderParserConfig, documentExtension } from './types.js'

type Config = TDocumentTransformerConfig &
  OpenDataLoaderParserConfig & { signal?: AbortSignal; fileScope?: WorkspaceFileScope }
type Documents = Parameters<IDocumentTransformerStrategy['transformDocuments']>[0]
type Results = Awaited<ReturnType<IDocumentTransformerStrategy['transformDocuments']>>
@Injectable()
@DocumentTransformerStrategy('opendataloader')
export class OpenDataLoaderTransformerStrategy implements IDocumentTransformerStrategy<Config> {
  constructor(private readonly converter: OpenDataLoaderSandboxConverter) {}
  readonly permissions: Permissions = [{ type: 'filesystem', operations: ['read', 'write'], scope: [] }]
  readonly meta = {
    name: 'opendataloader',
    label: { en_US: 'OpenDataLoader PDF', zh_Hans: 'OpenDataLoader PDF' },
    description: {
      en_US: 'Offline PDF text extraction with local OCR for scanned pages, using platform Sandbox Jobs.',
      zh_Hans: '通过平台沙箱离线解析 PDF；扫描页自动使用本地 OCR 识别中文和英文。'
    },
    icon: Icon,
    supportedFileTypes: FILE_TYPES,
    providesImageText: false,
    configSchema: {
      type: 'object',
      properties: {
        ocrConfidenceThreshold: {
          type: 'number',
          title: { en_US: 'Minimum OCR confidence', zh_Hans: 'OCR 最低置信度' },
          description: {
            en_US:
              'Text below this confidence is discarded. Lower values retain more text but may include recognition errors. Applies to scanned pages.',
            zh_Hans: '低于此置信度的文字会被丢弃。降低数值可保留更多文字，也可能保留误识别内容。仅影响扫描页 OCR。'
          },
          default: 0.5,
          minimum: 0,
          maximum: 1,
          'x-ui': {
            component: 'slider',
            inputs: { min: 0, max: 1, step: 0.01 }
          }
        }
      }
    }
  }
  async validateConfig(config: Config) {
    config.signal?.throwIfAborted()
    ParserConfigSchema.parse(config)
    await this.converter.checkHealth()
  }
  async transformDocuments(documents: Documents, config: Config): Promise<Results> {
    const fs = config.permissions?.fileSystem
    if (!fs) throw new Error('OpenDataLoader PDF requires the scoped knowledge-base filesystem')
    const output: Results = []
    for (const document of documents) {
      config.signal?.throwIfAborted()
      const extension = documentExtension(document.type, document.mimeType)
      if (!document.filePath || !FILE_TYPES.includes(extension)) throw new Error('OPENDATALOADER_UNSUPPORTED_FORMAT')
      const result = await this.converter.convert(document.filePath, extension, {
        signal: config.signal,
        fileScope: config.fileScope,
        documentId: document.id,
        stage: config.stage,
        ocrConfidenceThreshold: config.ocrConfidenceThreshold
      })
      const folder = 'opendataloader/' + randomUUID()
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
          ...(asset.page ? { page: asset.page } : {})
        })
      }
      const replaceReferences = (text: string) =>
        text.replace(/xpert-asset:\/\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g, (match) => references.get(match) ?? match)
      const markdown = replaceReferences(result.markdown)
      const originalPath = `${folder}/result.md`
      assets.push({ type: 'file', filePath: originalPath, url: await fs.writeFile(originalPath, markdown) })
      const pages = result.pages ?? [{ page: undefined, markdown: result.markdown }]
      const chunks = pages
        .filter((page) => page.markdown.trim())
        .map((page, index) => ({
          pageContent: replaceReferences(page.markdown),
          metadata: {
            chunkId: randomUUID(),
            chunkIndex: index,
            parser: 'opendataloader',
            mediaType: 'text' as const,
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
          parser: 'opendataloader',
          sandboxJobId: result.sandboxJobId,
          runtimeProfile: result.runtimeProfile,
          assets
        }
      })
    }
    return output
  }
}
