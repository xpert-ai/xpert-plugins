import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IKnowledgeDocument } from '@metad/contracts';
import type { ConfigService } from '@nestjs/config';
import type {
  TDocumentTransformerConfig,
  XpFileSystem,
} from '@xpert-ai/plugin-sdk';
import 'dotenv/config';
import { MinerUClient } from './mineru.client.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { MinerUTransformerStrategy } from './transformer-mineru.strategy.js';

describe('MinerUTransformerStrategy', () => {
  let strategy: MinerUTransformerStrategy;
  let configService: ConfigService;
  let resultParser: MinerUResultParserService;

  beforeEach(() => {
    configService = {
      get: jest.fn((name: string) => {
        return process.env[name];
      }),
    } as unknown as ConfigService;

    resultParser = new MinerUResultParserService();

    strategy = new MinerUTransformerStrategy();
    (strategy as any).configService = configService;
    (strategy as any).resultParser = resultParser;
  });

  it(
    'creates MinerU task and parses result using provided document URL',
    async () => {
      const document: Partial<IKnowledgeDocument> = {
        id: 'doc-real-url',
        folder: 'mineru-tests',
        fileUrl:
          'https://api.mtda.cloud/api/sandbox/volume/knowledges/2a0d2697-a363-4fa7-8bb2-d74a3a6b8265/知识库测试.pdf',
      };

      const fileSystemPermission = {
        writeFile: (filePath: string, content: string | Buffer) => {
          const sanitizedPath = filePath.startsWith('/')
            ? filePath.slice(1)
            : filePath;
          const debugRoot = join(process.cwd(), 'dist', 'data', 'mineru');
          const outputPath = join(debugRoot, sanitizedPath);
          mkdirSync(dirname(outputPath), { recursive: true });
          const data =
            typeof content === 'string'
              ? Buffer.from(content, 'base64')
              : content;
          writeFileSync(outputPath, data);
          return Promise.resolve(outputPath);
        },
      } as unknown as XpFileSystem;
      const config = {
        permissions: {
          integration: { id: 'integration-1' },
          fileSystem: fileSystemPermission,
        },
      } as unknown as TDocumentTransformerConfig;

      const parsedDocument = {
        id: document.id,
        metadata: { parser: 'MinerU', taskId: 'miner-task' },
        chunks: [{ pageContent: 'parsed content' }],
      };

      const results = await strategy.transformDocuments([document], config);

      console.log('Parsed Document:', JSON.stringify(results, null, 2));

      expect(MinerUClient).toHaveBeenCalledWith(
        configService,
        config.permissions?.integration
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(document.id);
      expect(parsedDocument.id).toBe(document.id);
      expect(results[0]?.metadata).toBe(parsedDocument.metadata);
    },
    60 * 1000
  );
});
