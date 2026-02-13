import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IKnowledgeDocument } from '@metad/contracts';
import type { ConfigService } from '@nestjs/config';
import type {
  TDocumentTransformerConfig,
  XpFileSystem,
} from '@xpert-ai/plugin-sdk';
import 'dotenv/config';
import axios from 'axios';
import { MinerUClient } from './mineru.client.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { MinerUTransformerStrategy } from './transformer-mineru.strategy.js';
import { MinerUIntegration } from './types.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock MinerUResultParserService
jest.mock('./result-parser.service.js');

// Mock MinerUClient
jest.mock('./mineru.client.js');

describe('MinerUTransformerStrategy', () => {
  let strategy: MinerUTransformerStrategy;
  let configService: ConfigService;
  let resultParser: MinerUResultParserService;
  let mockMinerUClientInstance: any;

  beforeEach(() => {
    configService = {
      get: jest.fn((name: string) => {
        return process.env[name];
      }),
    } as unknown as ConfigService;

    resultParser = {
      parseFromUrl: jest.fn().mockResolvedValue({
        id: 'doc-real-url',
        chunks: [
          {
            pageContent: '# Test Document\n\nThis is test content.',
            metadata: { page: 1 },
          },
        ],
        metadata: {
          parser: 'mineru',
          taskId: 'test-task-id',
          assets: [],
        },
      }),
      parseLocalTask: jest.fn().mockResolvedValue({
        id: 'doc-real-url',
        chunks: [
          {
            pageContent: '# Test Document\n\nThis is test content.',
            metadata: { page: 1 },
          },
        ],
        metadata: {
          parser: 'mineru',
          taskId: 'test-task-id',
          assets: [],
        },
      }),
    } as any;

    strategy = new MinerUTransformerStrategy();
    (strategy as any).configService = configService;
    (strategy as any).resultParser = resultParser;

    // Setup MinerUClient mock
    mockMinerUClientInstance = {
      serverType: 'official',
      createTask: jest.fn().mockResolvedValue({ taskId: 'test-task-id' }),
      waitForTask: jest.fn().mockResolvedValue({
        status: 'done',
        full_zip_url: 'https://example.com/result.zip',
      }),
    };

    (MinerUClient as jest.MockedClass<typeof MinerUClient>).mockImplementation(() => {
      return mockMinerUClientInstance as any;
    });

    // Reset mocks (but keep the implementation)
    jest.clearAllMocks();
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
          integration: { 
            id: 'integration-1',
            provider: 'mineru_api',
            options: {
              apiUrl: 'https://mineru.net/api/v4',
              apiKey: 'test-key',
            },
          },
          fileSystem: fileSystemPermission,
        },
      } as unknown as TDocumentTransformerConfig;

      const results = await strategy.transformDocuments([document], config);

      // Verify MinerUClient was instantiated
      expect(MinerUClient).toHaveBeenCalledWith(
        configService,
        config.permissions
      );

      // Verify createTask was called
      expect(mockMinerUClientInstance.createTask).toHaveBeenCalled();

      // Ensure the transformer uses a distinct integration provider key from the builtin toolset provider
      expect(MinerUIntegration).toBe('mineru_api');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    },
    60 * 1000
  );
});
