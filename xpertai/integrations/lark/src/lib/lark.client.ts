import * as lark from '@larksuiteoapi/node-sdk'
import type { IIntegration } from '@metad/contracts'
import type { TDocumentAsset, XpFileSystem } from '@xpert-ai/plugin-sdk'
import path from 'node:path'
import { formatLarkErrorToMarkdown, LarkFile, parseLarkClientError } from './types.js'

export type LarkDocumentImageAsset = TDocumentAsset & {
  token: string
  sourceUrl?: string
  blockId?: string
  caption?: string
  width?: number
  height?: number
  mimeType?: string
}

type LarkDocumentBlock = {
  block_id?: string
  image?: {
    token?: string
    width?: number
    height?: number
    caption?: {
      content?: string
    }
  }
}

type LarkTmpDownloadUrl = {
  file_token: string
  tmp_download_url: string
}

type LarkDocumentImageBlock = {
  token: string
  blockId?: string
  caption?: string
  width?: number
  height?: number
}

/**
 * Common Lark Methods
 */
export class LarkClient {
  private client: lark.Client
  constructor(private readonly integration: IIntegration) {
    this.client = new lark.Client({
      appId: integration.options.appId,
      appSecret: integration.options.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: integration.options.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.debug
    })
  }

  async getBotInfo() {
    const res = await this.client.request({
      method: 'GET',
      url: '/open-apis/bot/v3/info',
      data: {},
      params: {}
    })

    return res.bot
  }

  // Online Documents

  /**
   * Get root folder token
   */
  async getRootFolderToken(): Promise<string> {
    
    const res = await this.client.request({
      url: '/open-apis/drive/explorer/v2/root_folder/meta',
      method: 'GET'
    })

    if (res.code !== 0) {
      throw new Error(`Get root folder failed: ${res.msg}`)
    }

    return res.data.token
  }

  /**
   * List child files/folders in a folder
   */
  async listDriveFiles(folderToken: string): Promise<LarkFile[]> {
    try {
      const res = await this.client.drive.file.list({params: {folder_token: folderToken}})

      if (res.code !== 0) {
        throw new Error(`Get folder children failed: ${res.msg}`)
      }

      return res.data.files
    } catch (error: unknown) {
      throw formatLarkErrorToMarkdown(parseLarkClientError(error))
    }
  }

  /**
   * Get document content
   */
  async getDocumentContent(docToken: string): Promise<string> {
    try {
      const res = await this.client.docx.document.rawContent({
        params: {
          lang: 1,
        },
        path: {
          document_id: docToken
        }
      })

      if (res.code !== 0) {
        throw new Error(`Get document content failed: ${res.msg}`)
      }

      return res.data.content
    } catch (error: unknown) {
      throw formatLarkErrorToMarkdown(parseLarkClientError(error))
    }
  }

  async getDocumentImages(
    docToken: string,
    fileSystem?: XpFileSystem,
    baseFolder?: string
  ): Promise<LarkDocumentImageAsset[]> {
    try {
      const imageBlocks = (await this.listDocumentBlocks(docToken))
        .map((block): LarkDocumentImageBlock | null => ({
          blockId: block.block_id,
          token: block.image?.token ?? '',
          width: block.image?.width,
          height: block.image?.height,
          caption: block.image?.caption?.content
        }))
        .filter((image): image is LarkDocumentImageBlock => !!image && image.token.trim().length > 0)

      if (!imageBlocks.length) {
        return []
      }

      const sourceUrls = fileSystem
        ? new Map<string, string>()
        : await this.getMediaTmpDownloadUrls(imageBlocks.map((image) => image.token))
      const assets: LarkDocumentImageAsset[] = []
      for (const image of imageBlocks) {
        const downloaded = fileSystem
          ? await this.downloadMediaToFileSystem(image.token, fileSystem, baseFolder ?? path.posix.join('lark', docToken))
          : null
        const sourceUrl = sourceUrls.get(image.token)
        const fallbackPath = sourceUrl ?? image.token
        assets.push({
          type: 'image',
          url: downloaded?.url ?? fallbackPath,
          filePath: downloaded?.filePath ?? fallbackPath,
          token: image.token,
          sourceUrl,
          blockId: image.blockId,
          caption: image.caption,
          width: image.width,
          height: image.height,
          mimeType: downloaded?.mimeType
        })
      }

      return assets
    } catch (error: unknown) {
      throw formatLarkErrorToMarkdown(parseLarkClientError(error))
    }
  }

  private async listDocumentBlocks(docToken: string): Promise<LarkDocumentBlock[]> {
    const blocks: LarkDocumentBlock[] = []
    let pageToken: string | undefined
    let hasMore = false
    do {
      const params: { page_size: number; page_token?: string } = { page_size: 500 }
      if (pageToken) {
        params.page_token = pageToken
      }
      const res = await this.client.docx.documentBlock.list({
        path: {
          document_id: docToken
        },
        params
      })

      if (res.code !== 0) {
        throw new Error(`Get document blocks failed: ${res.msg}`)
      }

      blocks.push(...((res.data?.items ?? []) as LarkDocumentBlock[]))
      hasMore = Boolean(res.data?.has_more)
      pageToken = res.data?.page_token
    } while (hasMore && pageToken)

    return blocks
  }

  private async getMediaTmpDownloadUrls(fileTokens: string[]): Promise<Map<string, string>> {
    const res = await this.client.drive.media.batchGetTmpDownloadUrl({
      params: {
        file_tokens: fileTokens
      }
    })

    if (res.code !== 0) {
      throw new Error(`Get media download URLs failed: ${res.msg}`)
    }

    return new Map(
      ((res.data?.tmp_download_urls ?? []) as LarkTmpDownloadUrl[]).map((item) => [
        item.file_token,
        item.tmp_download_url
      ])
    )
  }

  private async downloadMediaToFileSystem(
    fileToken: string,
    fileSystem: XpFileSystem,
    baseFolder: string
  ): Promise<{ url: string; filePath: string; mimeType?: string }> {
    const media = await this.client.drive.media.download({
      path: {
        file_token: fileToken
      }
    })
    const mimeType = getHeaderValue(media.headers, 'content-type')
    const filePath = path.posix.join(baseFolder, 'images', `${safeFileNameSegment(fileToken)}.${imageExtension(mimeType)}`)
    const url = await fileSystem.writeFile(filePath, await readableToBuffer(media.getReadableStream()))

    return {
      url,
      filePath,
      mimeType
    }
  }

  /**
   * Recursively retrieve all documents in a folder
   */
  async getAllDocsInFolder(folderToken: string): Promise<LarkFile[]> {
    let result: LarkFile[] = []
    const children = await this.listDriveFiles(folderToken)

    for (const child of children) {
      if (child.type === 'folder') {
        // Recursively enter subfolders
        const subDocs = await this.getAllDocsInFolder(child.token)
        result = result.concat(subDocs)
      } else if (child.type === 'docx') {
        result.push(child)
      }
    }

    return result
  }
}

async function readableToBuffer(stream: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
    } else if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
    } else if (ArrayBuffer.isView(chunk)) {
      chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    } else {
      chunks.push(Buffer.from(String(chunk)))
    }
  }
  return Buffer.concat(chunks)
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined
  }

  const lowerKey = key.toLowerCase()
  const value =
    Reflect.get(headers, key) ??
    Reflect.get(headers, lowerKey) ??
    Reflect.ownKeys(headers).reduce<unknown>((match, headerKey) => {
      if (match !== undefined || typeof headerKey !== 'string' || headerKey.toLowerCase() !== lowerKey) {
        return match
      }
      return Reflect.get(headers, headerKey)
    }, undefined)
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === 'string')
  }
  return undefined
}

function imageExtension(mimeType: string | undefined) {
  switch (mimeType?.split(';')[0]?.trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    case 'image/png':
    default:
      return 'png'
  }
}

function safeFileNameSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'image'
}
