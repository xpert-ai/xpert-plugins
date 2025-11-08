import 'dotenv/config';

import type { IIntegration } from '@metad/contracts';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MinerUClient } from './mineru.client.js';
import {
  ENV_MINERU_API_BASE_URL,
  ENV_MINERU_API_TOKEN,
  ENV_MINERU_SERVER_TYPE,
} from './types.js';
import { XpFileSystem } from '@xpert-ai/plugin-sdk';
import { readFile } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const _dirname = dirname(__filename);
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


const createConfigServiceMock = (
  values: Record<string, string | undefined> = {},
) => {
  const get = jest.fn((key: string) => values[key]);
  return {
    instance: { get } as unknown as ConfigService,
    getMock: get,
  };
};

const integrationOptions: Partial<IIntegration> = {
  options: {
    apiUrl: 'https://custom-mineru.test/api/v4',
    apiKey: 'integration-token',
    serverType: 'official',
  },
};

const createSamplePdfBuffer = (text: string): Buffer => {
  const header = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const content = `BT\n/F1 24 Tf\n100 700 Td\n(${text}) Tj\nET\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  const xrefEntries = ['0000000000 65535 f \n'];
  let offset = Buffer.byteLength(header);
  let body = '';

  objects.forEach((object) => {
    xrefEntries.push(`${offset.toString().padStart(10, '0')} 00000 n \n`);
    body += object;
    offset += Buffer.byteLength(object);
  });

  const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join('')}trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  const pdfString = header + body + xref;

  return Buffer.from(pdfString, 'utf-8');
};

const isConnectionRefused = (error: any): boolean => {
  if (!error) {
    return false;
  }

  if (error.code === 'ECONNREFUSED') {
    return true;
  }

  if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
    return true;
  }

  return Boolean(error.cause && error.cause.code === 'ECONNREFUSED');
};

describe('MinerUClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should use integration options when provided', async () => {
    const { instance: configService } = createConfigServiceMock();
    const client = new MinerUClient(configService, {integration: integrationOptions});

    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({
        data: {
          code: 0,
          trace_id: 'trace',
          msg: 'ok',
          data: { task_id: 'task-123' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as AxiosResponse);

    const options = {
      url: 'https://example.com/doc.pdf',
      isOcr: true,
      enableFormula: true,
      enableTable: false,
      language: 'en',
      modelVersion: 'vlm',
      dataId: 'data-1',
      pageRanges: '1-3',
      extraFormats: ['docx', 'html'],
      callbackUrl: 'https://callback.test',
      seed: 'seed-1',
    };

    const result = await client.createTask(options);

    expect(result.taskId).toBe('task-123');
    expect(postSpy).toHaveBeenCalledWith(
      'https://custom-mineru.test/api/v4/extract/task',
      expect.objectContaining({
        url: options.url,
        is_ocr: options.isOcr,
        enable_formula: options.enableFormula,
        enable_table: options.enableTable,
        language: options.language,
        model_version: options.modelVersion,
        data_id: options.dataId,
        page_ranges: options.pageRanges,
        extra_formats: options.extraFormats,
        callback: options.callbackUrl,
        seed: options.seed,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer integration-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should read configuration from ConfigService when integration is missing', async () => {
    const configValues = {
      [ENV_MINERU_API_BASE_URL]: 'https://env-mineru.test/api/v4',
      [ENV_MINERU_API_TOKEN]: 'env-token',
    };
    const { instance: configService, getMock } = createConfigServiceMock(configValues);
    const client = new MinerUClient(configService);

    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({
        data: {
          code: 0,
          trace_id: 'trace',
          msg: 'ok',
          data: { task_id: 'task-env' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as AxiosResponse);

    await client.createTask({ url: 'https://example.com/env.pdf' });

    expect(postSpy).toHaveBeenCalledWith(
      'https://env-mineru.test/api/v4/extract/task',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer env-token',
        }),
      }),
    );
    expect(getMock).toHaveBeenCalledWith(ENV_MINERU_API_BASE_URL);
    expect(getMock).toHaveBeenCalledWith(ENV_MINERU_API_TOKEN);
  });

  it('should create batch task with transformed file payload', async () => {
    const { instance: configService } = createConfigServiceMock();
    const client = new MinerUClient(configService, {integration: integrationOptions});

    const payload = {
      files: [
        {
          url: 'https://example.com/file-1.pdf',
          isOcr: true,
          dataId: 'data-1',
          pageRanges: '1-2',
        },
        {
          url: 'https://example.com/file-2.pdf',
        },
      ],
      enableFormula: true,
      enableTable: true,
      language: 'zh',
      modelVersion: 'pipeline',
      extraFormats: ['docx'],
      callbackUrl: 'https://callback.test/batch',
      seed: 'seed-2',
    };

    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({
        data: {
          code: 0,
          trace_id: 'trace',
          msg: 'ok',
          data: { batch_id: 'batch-1', file_urls: ['https://cdn/file-1.zip'] },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as AxiosResponse);

    const response = await client.createBatchTask(payload);

    expect(response).toEqual({ batchId: 'batch-1', fileUrls: ['https://cdn/file-1.zip'] });
    expect(postSpy).toHaveBeenCalledWith(
      'https://custom-mineru.test/api/v4/extract/task/batch',
      expect.objectContaining({
        files: [
          expect.objectContaining({
            url: payload.files[0].url,
            is_ocr: true,
            data_id: 'data-1',
            page_ranges: '1-2',
          }),
          expect.objectContaining({
            url: payload.files[1].url,
          }),
        ],
        enable_formula: true,
        enable_table: true,
        language: 'zh',
        model_version: 'pipeline',
        extra_formats: ['docx'],
        callback: 'https://callback.test/batch',
        seed: 'seed-2',
      }),
      expect.any(Object),
    );
  });

  it('should request task result with optional query params', async () => {
    const { instance: configService } = createConfigServiceMock();
    const client = new MinerUClient(configService, {integration: integrationOptions});

    const getSpy = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({
        data: {
          code: 0,
          trace_id: 'trace',
          msg: 'ok',
          data: { status: 'done', full_url: 'https://cdn/result.json' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as AxiosResponse);

    const result = await client.getTaskResult('task-123', {
      enableFormula: true,
      enableTable: false,
      language: 'en',
    });

    expect(result).toEqual({ status: 'done', full_url: 'https://cdn/result.json' });
    expect(getSpy).toHaveBeenCalledWith(
      'https://custom-mineru.test/api/v4/extract/task/task-123',
      expect.objectContaining({
        params: {
          enable_formula: true,
          enable_table: false,
          language: 'en',
        },
        headers: expect.objectContaining({
          Authorization: 'Bearer integration-token',
        }),
      }),
    );
  });

  it('should poll until task provides a finished result', async () => {
    const { instance: configService } = createConfigServiceMock();
    const client = new MinerUClient(configService, {integration: integrationOptions});

    const finalResult = { full_url: 'https://cdn/result.json' };
    const getTaskResultSpy = jest
      .spyOn(client, 'getTaskResult')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(finalResult);

    const result = await client.waitForTask('task-xyz', 1000, 0);

    expect(result).toBe(finalResult);
    expect(getTaskResultSpy).toHaveBeenCalledTimes(2);
  });

  it('should upload file and cache result for self-hosted deployments', async () => {
    const { instance: configService } = createConfigServiceMock();
    const selfHostedBaseUrl =
      process.env[ENV_MINERU_API_BASE_URL] ?? 'http://localhost:9960';
    const selfHostedApiKey = process.env[ENV_MINERU_API_TOKEN];
    const client = new MinerUClient(configService, {
      integration: {
        options: {
          apiUrl: selfHostedBaseUrl,
          serverType: 'self-hosted',
          ...(selfHostedApiKey ? { apiKey: selfHostedApiKey } : {}),
        },
      },
      fileSystem: {
        readFile: (filePath: string) =>
          new Promise<Buffer>((resolve, reject) => {
            readFile(filePath, (err, data) => {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            });
          }),
        fullPath: (filePath: string) => filePath,
      } as XpFileSystem
    });

    const samplePdf = createSamplePdfBuffer('Hello MinerU');
    const fileServer = createServer((req, res) => {
      console.log(req.url)
      if (req.url === '/%E6%96%87%E4%BB%B6%20doc.pdf') {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': samplePdf.length,
        });
        res.end(samplePdf);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve, reject) => {
      fileServer.once('error', reject);
      fileServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = fileServer.address() as AddressInfo;
    const sourceUrl = `http://127.0.0.1:${address.port}/文件 doc.pdf`;

    let taskId: string | undefined;
    try {
      ({ taskId } = await client.createTask({
        url: sourceUrl,
        filePath: pdfDocumentPath,
        // language: 'en',
        enableFormula: false,
        returnMiddleJson: false
      }));
      console.log(`Created task with ID: ${taskId}`);
    } catch (error: any) {
      console.error(error);
      if (isConnectionRefused(error)) {
        console.warn(
          `MinerU self-hosted server not reachable on ${selfHostedBaseUrl}. Skipping test.`,
        );
        return;
      }
      throw error;
    } finally {
      await new Promise<void>((resolve) => fileServer.close(() => resolve()));
    }

    expect(taskId).toBeDefined();

    const result = client.getSelfHostedTask(taskId!);
    console.log('Task result:', result);
    expect(typeof result.mdContent).toBe('string');
    expect(result.fileName).toBeDefined();
    expect(Array.isArray(result.images)).toBe(true);
    expect(result.raw).toBeDefined();
    expect(result.sourceUrl).toBe(sourceUrl);
  });

  it('should derive self-hosted mode from environment settings', async () => {
    const configValues = {
      [ENV_MINERU_SERVER_TYPE]: 'self-hosted',
      [ENV_MINERU_API_BASE_URL]: 'http://127.0.0.1:9000',
      [ENV_MINERU_API_TOKEN]: 'local-token',
    };
    const { instance: configService } = createConfigServiceMock(configValues);
    const client = new MinerUClient(configService);

    const downloadResponse = {
      data: Buffer.from('pdf-file'),
      headers: {
        'content-type': 'application/pdf',
      },
      status: 200,
      statusText: 'OK',
      config: {},
      request: {},
    } as AxiosResponse;

    const parseResponse = {
      data: {
        md_content: '# Local',
        content_list: [],
        images: {},
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as AxiosResponse;

    const getSpy = jest.spyOn(axios, 'get').mockResolvedValueOnce(downloadResponse);
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce(parseResponse);

    const { taskId } = await client.createTask({ url: 'https://example.com/local.pdf' });
    const result = await client.getTaskResult(taskId);

    expect(result.mdContent).toBe('# Local');
    expect(getSpy).toHaveBeenCalledWith('https://example.com/local.pdf', expect.objectContaining({ responseType: 'arraybuffer' }));
    expect(postSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/file_parse',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer local-token',
          accept: 'application/json',
        }),
      }),
    );
  });

  it('should fallback to localhost for self-hosted when no base URL provided', () => {
    const { instance: configService } = createConfigServiceMock({
      [ENV_MINERU_SERVER_TYPE]: 'self-hosted',
    });

    const client = new MinerUClient(configService);
    expect((client as any).baseUrl).toBe('http://localhost:9960');
  });

  it('should throw when official server token is missing', () => {
    const { instance: configService } = createConfigServiceMock();

    expect(
      () =>
        new MinerUClient(configService, {
          integration: {
            options: {
              apiUrl: 'https://official.api',
              serverType: 'official',
            },
          }
        })
    ).toThrow('MinerU official API requires an access token');
  });

  const connectivityIt =
    process.env[ENV_MINERU_API_BASE_URL] && process.env[ENV_MINERU_API_TOKEN] ? it : it.skip;

  connectivityIt(
    'should reach MinerU API when environment variables are configured',
    async () => {
      const envConfigService = {
        get: (key: string) => process.env[key],
      } as unknown as ConfigService;

      const client = new MinerUClient(envConfigService);
      const task = await client.createTask({
        url:
          process.env.MINERU_TEST_SOURCE_URL ||
          'https://file-examples.com/storage/feff2db2ca5b1e7985f85bb/2017/10/file-example_PDF_1MB.pdf',
        isOcr: true,
      });

      expect(task.taskId).toBeDefined();
    },
    20000,
  );
});
