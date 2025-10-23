import "dotenv/config";

import type { IIntegration } from '@metad/contracts';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { MinerUClient } from './mineru.client.js';
import { ENV_MINERU_API_BASE_URL, ENV_MINERU_API_TOKEN } from './types.js';


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
  },
};

describe('MinerUClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should use integration options when provided', async () => {
    const { instance: configService } = createConfigServiceMock();
    const client = new MinerUClient(configService, integrationOptions);

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
    const client = new MinerUClient(configService, integrationOptions);

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
    const client = new MinerUClient(configService, integrationOptions);

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
    const client = new MinerUClient(configService, integrationOptions);

    const finalResult = { full_url: 'https://cdn/result.json' };
    const getTaskResultSpy = jest
      .spyOn(client, 'getTaskResult')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(finalResult);

    const result = await client.waitForTask('task-xyz', 1000, 0);

    expect(result).toBe(finalResult);
    expect(getTaskResultSpy).toHaveBeenCalledTimes(2);
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
