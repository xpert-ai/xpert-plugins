import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable } from '@nestjs/common'
import {
  ChunkMetadata,
  FileSystemPermission,
  IImageUnderstandingStrategy,
  ImageUnderstandingStrategy,
  LLMPermission,
  TImageUnderstandingConfig,
  TDocumentAsset,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { buildChunkTree, collectTreeLeaves, IconType } from '@xpert-ai/contracts'
import { Document, DocumentInterface } from '@langchain/core/documents'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { SvgIcon, VlmDefault } from './types.js'

// Regex for markdown image tag: ![](image.png) or ![alt](image.png)
const IMAGE_REGEX = /!\[[^\]]*\]\s*\(((?:https?:\/\/[^)]+|[^)\s]+))(\s*"[^"]*")?\)/g

type VlmConfig = TImageUnderstandingConfig & { promptTemplate?: string }

@Injectable()
@ImageUnderstandingStrategy(VlmDefault)
export class VlmDefaultStrategy implements IImageUnderstandingStrategy<VlmConfig> {
  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read'],
      scope: []
    } as FileSystemPermission,
    {
      type: 'llm',
      capability: 'vision'
    } as LLMPermission
  ]

  readonly meta = {
    name: VlmDefault,
    label: { en_US: 'VLM', zh_Hans: '视觉语言模型' },
    description: {
      en_US: 'Use V(ision)LM to understand images, the knowledge base needs to be configured with a visual model.',
      zh_Hans: '使用视觉大模型来理解图片，知识库需要配置视觉模型。'
    },
    configSchema: {
      type: 'object',
      properties: {}
    },
    icon: {
      type: 'svg' as IconType,
      value: SvgIcon,
      color: '#2d8cf0'
    }
  }

  async validateConfig(config: TImageUnderstandingConfig): Promise<void> {
    if (!config?.visionModel) {
      throw new Error('Vision Model is required')
    }
  }

  async understandImages(
    doc: Parameters<IImageUnderstandingStrategy['understandImages']>[0],
    config: VlmConfig
  ): Promise<TImageUnderstandingResult> {
    await this.validateConfig(config)

    const client = config.visionModel // ✅ Injected by the core system
    const files = doc.metadata?.assets?.filter((asset) => asset.type === 'image') ?? []
    const leaves = collectTreeLeaves(buildChunkTree(doc.chunks))
    // Keep context parents as well as retrieval leaves, and avoid repeated OCR for overlapping chunks.
    const chunks: DocumentInterface<Partial<ChunkMetadata>>[] = []
    const leafIds = new Set(leaves.map((chunk) => chunk.metadata.chunkId))
    chunks.push(...doc.chunks.filter((chunk) => !leafIds.has(chunk.metadata.chunkId)))
    const processed = new Set<string>()
    const warnings: {
      type: 'image_understanding_failed' | 'image_understanding_skipped'
      message: string
      imagePath: string
    }[] = []
    for (const chunk of leaves) {
      chunks.push(chunk)
      for (const match of chunk.pageContent.matchAll(IMAGE_REGEX)) {
        const asset = files.find((item) => item.url === match[1])
        if (!asset || processed.has(asset.filePath)) continue
        processed.add(asset.filePath)
        try {
          const result = await this.runV(client, asset, config, chunk.pageContent)
          if (result.type === 'skipped') {
            warnings.push({ type: 'image_understanding_skipped', message: result.reason, imagePath: asset.filePath })
            continue
          }
          const description = result.text
          if (!description.trim()) throw new Error('The vision model returned no text.')
          chunks.push(
            new Document({
              pageContent: description,
              metadata: {
                mediaType: 'image',
                chunkId: uuid(),
                // Page transcriptions are independent source text and will be split by the host.
                ...(asset.sourceType === 'pdf_page'
                  ? { page: asset.page, sourceType: 'pdf_page', contentFormat: 'markdown' }
                  : { parentId: chunk.metadata.chunkId }),
                imagePath: asset.filePath,
                imageUrl: asset.url,
                parser: 'vlm'
              }
            })
          )
        } catch (error) {
          warnings.push({
            type: 'image_understanding_failed',
            message: error instanceof Error ? error.message : 'Image recognition failed.',
            imagePath: asset.filePath
          })
        }
      }
    }
    return { chunks, metadata: { warnings } }
  }

  private async runV(
    client: BaseChatModel,
    asset: TDocumentAsset,
    config: VlmConfig,
    context: string
  ): Promise<{ type: 'recognized'; text: string } | { type: 'skipped'; reason: string }> {
    const imageStr = await config.permissions.fileSystem.readFile(asset.filePath)
    const page = asset.sourceType === 'pdf_page'
    const image = sharp(imageStr)
    const { width, height } = await image.metadata()
    // Embedded tracking/spacer pixels contain no readable content. Never silently skip a PDF page.
    if (width === 1 || height === 1) {
      if (page) throw new Error(`PDF page image is too small to recognize (${width}×${height}).`)
      return { type: 'skipped', reason: `Skipped a ${width}×${height} placeholder image.` }
    }
    const imageData = await image
      .resize({ width: page ? 2200 : 1024, height: page ? 2200 : 1024, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    const response = await client.invoke([
      {
        role: 'system',
        content: page
          ? 'Transcribe all visible content of this document page into Markdown in reading order. Preserve headings, lists, table rows and merged-cell relationships. Copy numbers, leading zeroes, codes and punctuation exactly. Do not summarize, describe the page, invent text, or add a preface. Mark unreadable text as [unreadable].'
          : 'You are a professional assistant, helping people understand images in context. Please provide a narrative description of the image.'
      },
      {
        role: 'user',
        content: [
          ...(config.promptTemplate?.trim()
            ? [{ type: 'text' as const, text: config.promptTemplate.replaceAll('{{context}}', () => context) }]
            : []),
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageData.toString('base64')}`
            }
          }
        ]
      }
    ])

    return {
      type: 'recognized',
      text:
        typeof response.content === 'string'
          ? response.content
          : response.content
              .flatMap((part) => (part.type === 'text' && typeof part.text === 'string' ? [part.text] : []))
              .join('\n')
    }
  }
}
