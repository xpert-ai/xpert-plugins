import 'dotenv/config';

import { Document } from '@langchain/core/documents';
import type { IIntegration } from '@metad/contracts';
import { ConfigService } from '@nestjs/config';
import type { XpFileSystem } from '@xpert-ai/plugin-sdk';
import { existsSync, mkdirSync, writeFile } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENV_UNSTRUCTURED_API_BASE_URL,
  ENV_UNSTRUCTURED_API_TOKEN,
  TTransformerOptions,
  TUnstructuredIntegrationOptions,
  Unstructured,
} from './types.js';
import { UnstructuredService } from './unstructured.service.js';
import { UnstructuredTransformerStrategy } from './unstructured.strategy.js';

const __filename = fileURLToPath(import.meta.url);
const _dirname = dirname(__filename);

const baseUrl = process.env[ENV_UNSTRUCTURED_API_BASE_URL];
const apiKey = process.env[ENV_UNSTRUCTURED_API_TOKEN];

const describeIfConfigured = baseUrl || apiKey ? describe : describe.skip;

describeIfConfigured('UnstructuredTransformerStrategy (integration)', () => {
  let strategy: UnstructuredTransformerStrategy;

  const integration = {
    id: 'unstructured-env',
    options: {
      apiUrl: baseUrl as string,
      apiKey: apiKey as string,
    },
  } as IIntegration<TUnstructuredIntegrationOptions>;

  const sampleDocumentPath = join(_dirname, '..', '..', '..', '..', '__fixtures__', 'sample-notes.txt');
  const pdfDocumentPath = join(
    _dirname,
    '..',
    '..',
    '..',
    '..',
    '__fixtures__',
    '一加 Ace 5 Pro_入门指南_CN.pdf'
  );

  beforeAll(() => {
    const configService = new ConfigService();
    const service = new UnstructuredService(configService);
    strategy = new UnstructuredTransformerStrategy();
    (strategy as unknown as { service: UnstructuredService }).service = service;
  });

  const buildFileSystem = () =>
    ({
      readFile: (filePath: string) => readFile(filePath),
      writeFile: (filePath: string, content: string | Buffer) =>
        new Promise<string>((resolve, reject) => {
          const _filePath = join(_dirname, '..', '..', '..', '..', 'dist', 'data', 'unstructured', filePath)
          // Ensure file exists
          if (!existsSync(_filePath)) {
            mkdirSync(dirname(_filePath), { recursive: true });
          }

          writeFile(_filePath, content, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve('http://api.fileserver.com/' + filePath);
            }
          });
        }),
    } as unknown as XpFileSystem);

  const buildConfig = (fileSystem: XpFileSystem): TTransformerOptions => ({
    strategy: 'auto',
    permissions: {
      integration,
      fileSystem,
    },
    stage: 'prod',
    languages: ['eng', 'chi_sim'],
  });

  it('partitions a local document via the Unstructured API', async () => {
    const fileSystem = buildFileSystem();
    const transformerConfig = buildConfig(fileSystem);

    const results = await strategy.transformDocuments(
      [
        {
          id: 'sample-notes',
          filePath: sampleDocumentPath,
        },
      ],
      transformerConfig
    );

    console.log(
      `Unstructured API results (text):`,
      JSON.stringify(results, null, 2)
    );
    expect(results).toHaveLength(1);
    const [document] = results;
    expect(document?.id).toBe('sample-notes');
    expect(document?.metadata?.parser).toBe(Unstructured);
    expect(Array.isArray(document?.chunks)).toBe(true);
    const [chunk] = document?.chunks ?? [];
    expect(chunk).toBeInstanceOf(Document);
    expect(chunk?.pageContent?.length).toBeGreaterThan(0);
    expect(chunk?.metadata).toHaveProperty('type');
  }, 60_000);

  it('extracts structured chunks includes images from PDF file', async () => {
    const fileSystem = buildFileSystem();
    const transformerConfig = buildConfig(fileSystem);

    const results = await strategy.transformDocuments(
      [
        {
          id: 'oneplus-guide',
          filePath: pdfDocumentPath,
        },
      ],
      transformerConfig
    );

    console.log(
      `Unstructured API results (pdf):`,
      JSON.stringify(results, null, 2)
    );
    expect(results).toHaveLength(1);
    const [document] = results;
    expect(document?.id).toBe('oneplus-guide');
    expect(document?.metadata?.parser).toBe(Unstructured);
    expect(document?.metadata?.source).toContain('.pdf');
    expect(document?.chunks?.length).toBeGreaterThan(0);
    const [firstChunk] = document?.chunks ?? [];
    expect(firstChunk).toBeInstanceOf(Document);
    expect(firstChunk?.metadata).toEqual(
      expect.objectContaining({
        type: expect.any(String),
        page_number: expect.any(Number),
      })
    );
  }, 90_000);
});
