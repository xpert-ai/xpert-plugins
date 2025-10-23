import { Document } from '@langchain/core/documents'
import { IKnowledgeDocument } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ChunkMetadata, TDocumentAsset, XpFileSystem } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { join } from 'path'
import unzipper from 'unzipper'
import { v4 as uuidv4 } from 'uuid'
import { MinerU, MinerUDocumentMetadata } from './types.js'

@Injectable()
export class MinerUResultParserService {
  private readonly logger = new Logger(MinerUResultParserService.name)

  async parseFromUrl(fullZipUrl: string, taskId: string, document: Partial<IKnowledgeDocument>, fileSystem: XpFileSystem): Promise<{
    id?: string
    chunks: Document<ChunkMetadata>[]
    metadata: MinerUDocumentMetadata
  }> {
    this.logger.log(`Downloading MinerU result from: ${fullZipUrl}`)

    // 1. Download the zip file to memory
    const response = await axios.get(fullZipUrl, { responseType: 'arraybuffer' })
    const zipBuffer = Buffer.from(response.data)

    const metadata: MinerUDocumentMetadata = {
      parser: MinerU,
      taskId,
    }

    // 2. Unzip the file
    const zipEntries: { entryName: string; data: Buffer }[] = []
    const assets: TDocumentAsset[] = []
    const directory = await unzipper.Open.buffer(zipBuffer)
    let fullMd = ''
    let layoutJson: any = null
    for (const entry of directory.files) {
      if (!entry.type || entry.type !== 'File') continue
      const data = await entry.buffer()
      zipEntries.push({ entryName: entry.path, data })
      // Write images to local file system
      if (entry.path.startsWith('images/')) {
        const url = await fileSystem.writeFile(join(document.folder || '', entry.path), data)
        assets.push({
          type: 'image',
          url,
          filePath: entry.path
        })
      }

      const fileName = entry.path

      if (fileName.endsWith('layout.json')) {
        layoutJson = JSON.parse(data.toString('utf-8'))
        metadata.mineruBackend = layoutJson?._backend
        metadata.mineruVersion = layoutJson?._version_name
        assets.push({
          type: 'file',
          url: await fileSystem.writeFile(join(document.folder || '', entry.path), data),
          filePath: entry.path
        })
      } else if (fileName.endsWith('content_list.json')) {
        assets.push({
          type: 'file',
          url: await fileSystem.writeFile(join(document.folder || '', entry.path), data),
          filePath: entry.path
        })
      } else if (fileName.endsWith('full.md')) {
        fullMd = data.toString('utf-8')
        assets.push({
          type: 'file',
          url: await fileSystem.writeFile(join(document.folder || '', entry.path), data),
          filePath: entry.path
        })
      } else if (fileName.endsWith('origin.pdf')) {
        metadata.originPdfUrl = fileName
      }
    }

    metadata.assets = assets

    // 3. Parse chunks (simple rule: split by two newlines)
    fullMd = fullMd.replace(/!\[(.*)\]\((images\/.+?)\)/g, (match, p1, p2) => {
      const localPath = assets.find((asset) => asset.filePath === p2)?.url
      return localPath ? `![${p1}](${localPath})` : match
    })
    const chunks = [new Document<ChunkMetadata>({ pageContent: fullMd, metadata: { parser: MinerU, taskId, chunkId: uuidv4() } })]

    return {
      chunks,
      metadata
    }
  }
}
