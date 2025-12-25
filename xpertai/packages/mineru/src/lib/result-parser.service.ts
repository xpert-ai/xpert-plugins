import { Document } from '@langchain/core/documents';
import { IKnowledgeDocument } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChunkMetadata,
  TDocumentAsset,
  XpFileSystem,
} from '@xpert-ai/plugin-sdk';
import axios from 'axios';
import { join } from 'path';
import unzipper from 'unzipper';
import { v4 as uuidv4 } from 'uuid';
import {
  MinerU,
  MinerUDocumentMetadata,
  MineruSelfHostedTaskResult,
} from './types.js';

@Injectable()
export class MinerUResultParserService {
  private readonly logger = new Logger(MinerUResultParserService.name);

  async parseFromUrl(
    fullZipUrl: string,
    taskId: string,
    document: Partial<IKnowledgeDocument>,
    fileSystem?: XpFileSystem
  ): Promise<{
    id?: string;
    chunks: Document<ChunkMetadata>[];
    metadata: MinerUDocumentMetadata;
  }> {
    this.logger.debug(`Downloading MinerU result from: ${fullZipUrl}`);

    // 1. Download the zip file to memory
    const response = await axios.get(fullZipUrl, {
      responseType: 'arraybuffer',
    });
    const zipBuffer = Buffer.from(response.data);

    const metadata: MinerUDocumentMetadata = {
      parser: MinerU,
      taskId,
    };

    // 2. Unzip the file
    const zipEntries: { entryName: string; data: Buffer }[] = [];
    const assets: TDocumentAsset[] = [];
    const directory = await unzipper.Open.buffer(zipBuffer);
    const pathMap = new Map<string, string>();
    let fullMd = '';
    let layoutJson: any = null;
    for (const entry of directory.files) {
      if (!entry.type || entry.type !== 'File') continue;
      const data = await entry.buffer();
      zipEntries.push({ entryName: entry.path, data });

      const fileName = entry.path;
      const filePath = join(document.folder || '', entry.path);

      // If platform didn't provide filesystem permission, still parse markdown but skip persisting files.
      // This avoids runtime crashes like: "Cannot read properties of undefined (reading 'writeFile')".
      if (fileSystem) {
        const url = await fileSystem.writeFile(filePath, data);
        pathMap.set(fileName, url);
        // Write images to local file system
        if (fileName.startsWith('images/')) {
          assets.push({
            type: 'image',
            url: url,
            filePath: filePath,
          });
        } else if (fileName.endsWith('layout.json')) {
          layoutJson = JSON.parse(data.toString('utf-8'));
          metadata.mineruBackend = layoutJson?._backend;
          metadata.mineruVersion = layoutJson?._version_name;

          assets.push({
            type: 'file',
            url,
            filePath: filePath,
          });
        } else if (fileName.endsWith('content_list.json')) {
          assets.push({
            type: 'file',
            url,
            filePath: filePath,
          });
        } else if (fileName.endsWith('full.md')) {
          fullMd = data.toString('utf-8');
          assets.push({
            type: 'file',
            url,
            filePath: filePath,
          });
        } else if (fileName.endsWith('origin.pdf')) {
          metadata.originPdfUrl = fileName;
        }
      } else {
        // Still extract key metadata & markdown without writing to filesystem
        if (fileName.endsWith('layout.json')) {
          layoutJson = JSON.parse(data.toString('utf-8'));
          metadata.mineruBackend = layoutJson?._backend;
          metadata.mineruVersion = layoutJson?._version_name;
        } else if (fileName.endsWith('full.md')) {
          fullMd = data.toString('utf-8');
        } else if (fileName.endsWith('origin.pdf')) {
          metadata.originPdfUrl = fileName;
        }
      }
    }

    metadata.assets = assets;

    // 3. Replace image relative path in full.md with file url
    fullMd = fullMd.replace(/!\[(.*)\]\((images\/.+?)\)/g, (match, p1, p2) => {
      const localPath = pathMap.get(p2);
      return localPath ? `![${p1}](${localPath})` : match;
    });
    const chunks = [
      new Document<ChunkMetadata>({
        pageContent: fullMd,
        metadata: { parser: MinerU, taskId, chunkId: uuidv4() },
      }),
    ];

    return {
      chunks,
      metadata,
    };
  }

  async parseLocalTask(
    result: MineruSelfHostedTaskResult,
    taskId: string,
    document: Partial<IKnowledgeDocument>,
    fileSystem?: XpFileSystem
  ): Promise<{
    id?: string;
    chunks: Document<ChunkMetadata>[];
    metadata: MinerUDocumentMetadata;
  }> {
    const metadata: MinerUDocumentMetadata = {
      parser: MinerU,
      taskId,
    };
    const assets: TDocumentAsset[] = [];
    const pathMap = new Map();
    for (const image of result.images) {
      const filePath = join(document.folder || '', 'images', image.name);
      if (fileSystem) {
        const url = await fileSystem.writeFile(
          filePath,
          Buffer.from(image.dataUrl.split(',')[1], 'base64')
        );
        pathMap.set(`images/${image.name}`, url);
        assets.push({
          type: 'image',
          url: url,
          filePath: filePath,
        });
      } else {
        // Fallback: keep images as data URLs so markdown can still render without filesystem permission
        pathMap.set(`images/${image.name}`, image.dataUrl);
        assets.push({
          type: 'image',
          url: image.dataUrl,
          filePath: filePath,
        });
      }
    }

    if (result.sourceUrl) {
      assets.push({
        type: 'file',
        url: result.sourceUrl,
        filePath: join(document.folder || '', result.fileName || 'source.pdf'),
      });
      metadata.originPdfUrl = result.sourceUrl;
    }

    metadata.assets = assets;

    let fullMd = result.mdContent;
    // 3. Replace image relative path in full.md with file url
    fullMd = fullMd.replace(/!\[(.*)\]\((images\/.+?)\)/g, (match, p1, p2) => {
        const localPath = pathMap.get(p2);
        return localPath ? `![${p1}](${localPath})` : match;
    });
    const chunks = [
      new Document<ChunkMetadata>({
        pageContent: fullMd,
        metadata: { parser: MinerU, taskId, chunkId: uuidv4() },
      }),
    ];

    return {
      chunks,
      metadata,
    };
  }
}
