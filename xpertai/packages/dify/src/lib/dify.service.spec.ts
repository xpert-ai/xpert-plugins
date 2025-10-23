import { BadRequestException } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { DifyService } from './dify.service.js';
import { TDifyIntegrationOptions } from './types.js';

dotenv.config();

describe('DifyService', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env['DIFY_API_KEY'];
  let service: DifyService;
  let fetchMock: jest.Mock;

  beforeAll(() => {
    if (!process.env['DIFY_API_KEY']) {
      process.env['DIFY_API_KEY'] = 'need-your-dify-api-key';
    }
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env['DIFY_API_KEY'];
    } else {
      process.env['DIFY_API_KEY'] = originalApiKey;
    }
    globalThis.fetch = originalFetch as any;
  });

  beforeEach(() => {
    service = new DifyService();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as any;
  });

  afterEach(() => {
    fetchMock.mockReset();
    jest.clearAllMocks();
    globalThis.fetch = originalFetch as any;
  });

  const buildOptions = (
    overrides: Partial<TDifyIntegrationOptions> = {}
  ): TDifyIntegrationOptions => ({
    url: 'https://api.dify.ai/v1/',
    apiKey: process.env['DIFY_API_KEY'] as string,
    ...overrides,
  });

  it('throws a BadRequestException when url is missing', async () => {
    await expect(
      service.test(
        buildOptions({
          url: '',
        })
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('sanitizes url by removing trailing slash and /v1', async () => {
    const mockInfo = { status: 'ok' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockInfo),
    });

    const result = await service.test(
      buildOptions({
        apiKey: 'app-123456',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith('https://api.dify.ai/v1/info?limit=1', expect.any(Object));
    expect(result).toEqual(mockInfo);

    await service.test(
      buildOptions({
        apiKey: 'dataset-123456',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith('https://api.dify.ai/v1/datasets?limit=1', expect.any(Object));
  });

  it('uses empty apiKey if not provided', async () => {
    const mockInfo = { status: 'ok' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockInfo),
    });

    await service.test(
      buildOptions({
        apiKey: undefined,
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.headers.Authorization).toBe('Bearer ');
  });

  it('throws BadRequestException if fetch throws non-Error value', async () => {
    fetchMock.mockRejectedValue('some string error');
    await expect(
      service.test(buildOptions())
    ).rejects.toThrow(BadRequestException);
  });

  it('performs a real connectivity test to Dify API if DIFY_API_KEY is set and not a placeholder', async () => {
    const apiKey = process.env['DIFY_API_KEY'];
    if (apiKey && apiKey !== 'need-your-dify-api-key') {
      globalThis.fetch = originalFetch as any;
      const realService = new DifyService();
      const result = realService.test({
          url: 'https://api.dify.ai/v1/',
          apiKey,
        })
      await expect(result).resolves.toBeDefined();
    } else {
      // Skip real connectivity test if no valid API key
      expect(true).toBe(true);
    }
  });

  it('calls the info endpoint with sanitized base url and returns the response', async () => {
    const mockInfo = { status: 'ok' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockInfo),
    });

    const result = await service.test(
      buildOptions({
        apiKey: 'app-123456',
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestedUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestedUrl).toBe('https://api.dify.ai/v1/info?limit=1');
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer app-123456`,
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result).toEqual(mockInfo);
  });

  it('throws a BadRequestException when Dify responds with an error status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
    });

    await expect(
      service.test(
        buildOptions({
          url: 'https://api.dify.ai/v1/',
        })
      )
    ).rejects.toThrow('Failed to connect to Dify: Unauthorized');
  });

  it('wraps fetch errors in a BadRequestException', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    await expect(
      service.test(
        buildOptions({
          url: 'https://api.dify.ai/v1/',
        })
      )
    ).rejects.toThrow('Error connecting to Dify: network error');
  });
});
