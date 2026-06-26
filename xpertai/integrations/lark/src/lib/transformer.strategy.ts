import { Injectable } from '@nestjs/common'
import { Document } from '@langchain/core/documents'
import {
  ChunkMetadata,
  DocumentTransformerStrategy,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  IntegrationPermission,
  TDocumentTransformerConfig,
} from '@xpert-ai/plugin-sdk'
import type { IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { iconImage, LarkDocumentMetadata, LarkDocumentName, LarkName } from './types.js'
import { LarkClient } from './lark.client.js'

@Injectable()
@DocumentTransformerStrategy(LarkDocumentName)
export class LarkDocTransformerStrategy implements IDocumentTransformerStrategy<TDocumentTransformerConfig> {

  readonly permissions = [
    {
      type: 'integration',
      service: LarkName,
      description: 'Access to Lark system integrations'
    } as IntegrationPermission,
    {
      type: 'filesystem',
      operations: ['write'],
      scope: []
    } as FileSystemPermission
  ]

  readonly meta = {
    name: LarkDocumentName,
    label: {
      en_US: 'Lark Document',
      zh_Hans: '飞书文档'
    },
    description: {
      en_US: 'Load content from Lark documents',
      zh_Hans: '加载飞书文档内容'
    },
    icon: {
      type: 'image' as IconType,
      value: iconImage,
      color: '#14b8a6'
    },
    helpUrl: 'https://open.feishu.cn/document/server-docs/docs/docs-overview',
    configSchema: {
      type: 'object',
      properties: {
      },
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async transformDocuments(
    files: Partial<IKnowledgeDocument<LarkDocumentMetadata>>[],
    config: TDocumentTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    const integration = config?.permissions?.integration
    if (!integration) {
      throw new Error('Integration system is required')
    }

    const client = new LarkClient(integration)
    
    const results: Partial<IKnowledgeDocument<ChunkMetadata>>[] = []
    for await (const file of files) {
      const docToken = file.metadata?.token || file.id || ''
      const content = await client.getDocumentContent(docToken)
      let assets: ChunkMetadata['assets'] = []
      let imageAssetError: string | undefined
      try {
        assets = await client.getDocumentImages(docToken, config.permissions?.fileSystem, file.folder)
      } catch (error: unknown) {
        imageAssetError = toErrorMessage(error)
      }
      const pageContent = placeImageReferences(content, assets)
      results.push({
        id: file.id,
        chunks: [
          new Document({
            id: file.id,
            pageContent,
            metadata: {
              assets,
              imageAssetError,
              chunkId: file.id,
              source: LarkName,
              sourceId: file.id,
              type: 'parent' as const
            }
          })
        ],
        metadata: {
          ...(file.metadata ?? {}),
          assets,
          imageAssetError,
          type: 'parent' as const
        } as ChunkMetadata
      })
    }
    return results
  }
}

const standaloneImagePlaceholderPattern = /(^|\r?\n)[^\S\r\n]*[^/\s\\]+\.(?:png|jpe?g|gif|webp|bmp)[^\S\r\n]*(?=\r?\n|$)/gi

function placeImageReferences(content: string, assets: ChunkMetadata['assets'] = []) {
  if (!assets.length) {
    return content
  }

  const imageReferences = assets.map((asset) => {
    const caption = Reflect.get(asset, 'caption')
    return `![${typeof caption === 'string' ? caption : 'image'}](${asset.url})`
  })
  let imageIndex = 0
  const contentWithInlineImages = content.replace(standaloneImagePlaceholderPattern, (match, lineStart: string) => {
    if (imageIndex >= imageReferences.length) {
      return match
    }
    const reference = imageReferences[imageIndex]
    imageIndex += 1
    return `${lineStart}${reference}`
  })
  const remainingReferences = imageReferences.slice(imageIndex)

  if (!remainingReferences.length) {
    return contentWithInlineImages
  }

  return [contentWithInlineImages, ...remainingReferences].join('\n')
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
