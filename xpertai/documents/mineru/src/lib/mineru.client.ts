import { IIntegration } from '@xpert-ai/contracts';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage, XpFileSystem } from '@xpert-ai/plugin-sdk';
import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { randomUUID } from 'crypto';
import { basename } from 'path';
import {
  ENV_MINERU_API_BASE_URL,
  ENV_MINERU_API_TOKEN,
  ENV_MINERU_SERVER_TYPE,
  MinerUIntegrationOptions,
  MineruSelfHostedImage,
  MineruSelfHostedTaskResult,
  MinerUServerType,
} from './types.js';

const DEFAULT_OFFICIAL_BASE_URL = 'https://mineru.net/api/v4';
const DEFAULT_REQUEST_TIMEOUT_MS = 1_200_000;
const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);
const RETRYABLE_API_CODES = new Set(['-10001', '-60007', '-60009', '-60010']);
const MAX_OFFICIAL_UPLOAD_FILES = 50;

interface CreateTaskOptions {
  url?: string;
  filePath?: string;
  fileName?: string;
  isOcr?: boolean;
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
  modelVersion?: string;
  dataId?: string;
  pageRanges?: string;
  extraFormats?: string[];
  callbackUrl?: string;
  seed?: string;
  noCache?: boolean;
  cacheTolerance?: number;
  /** Optional parse method used by self-hosted MinerU deployments */
  parseMethod?: string;
  /** Optional backend identifier used by self-hosted MinerU deployments */
  backend?: string;
  /** Optional mineru backend server url (used when backend is VLM client) */
  serverUrl?: string;
  /** Whether to request intermediate JSON payloads from self-hosted MinerU */
  returnMiddleJson?: boolean;
}

interface CreateBatchTaskFile {
  url: string;
  isOcr?: boolean;
  dataId?: string;
  pageRanges?: string;
}

interface CreateBatchTaskOptions {
  files: CreateBatchTaskFile[];
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
  modelVersion?: string;
  extraFormats?: string[];
  callbackUrl?: string;
  seed?: string;
}

export interface CreateUploadBatchFile {
  name: string;
  buffer: Buffer;
  isOcr?: boolean;
  dataId?: string;
  pageRanges?: string;
}

export interface CreateUploadBatchOptions {
  files: CreateUploadBatchFile[];
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
  modelVersion?: string;
  extraFormats?: string[];
  callbackUrl?: string;
  seed?: string;
}

interface TaskResultOptions {
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
}

type SelfHostedFileField = 'files' | 'file';

interface MineruTaskResult {
  code: number | string;
  msg: string;
  trace_id: string;
  data: any;
}

export interface MineruBatchExtractResult {
  file_name: string;
  state: 'waiting-file' | 'uploading' | 'pending' | 'running' | 'converting' | 'done' | 'failed' | string;
  full_zip_url?: string;
  err_msg?: string;
  err_code?: number | string;
  data_id?: string;
  extract_progress?: {
    extracted_pages?: number;
    total_pages?: number;
    start_time?: string;
  };
}

export interface MineruBatchResult {
  batch_id: string;
  extract_result: MineruBatchExtractResult[];
}

class MinerUApiError extends Error {
  constructor(
    message: string,
    readonly details: {
      operation: string;
      code?: number | string;
      traceId?: string;
      httpStatus?: number;
      batchId?: string;
      fileName?: string;
    } = { operation: 'request' }
  ) {
    super(message);
    this.name = 'MinerUApiError';
  }
}

export class MinerUClient {
  private readonly logger = new Logger(MinerUClient.name);
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly requestTimeoutMs: number;
  public readonly serverType: MinerUServerType;
  private readonly localTasks = new Map<string, MineruSelfHostedTaskResult>();

  get fileSystem(): XpFileSystem | undefined {
    return this.permissions?.fileSystem;
  }
  constructor(
    private readonly configService: ConfigService,
    private readonly permissions?: {
            fileSystem?: XpFileSystem;
            integration?: Partial<IIntegration<MinerUIntegrationOptions>>;
        }
  ) {
    const integration = this.permissions?.integration;
    this.serverType = this.resolveServerType(integration);
    const { baseUrl, token } = this.resolveCredentials(integration);

    if (!baseUrl) {
      throw new Error('MinerU base URL is required');
    }

    this.baseUrl = this.normalizeBaseUrl(baseUrl);
    this.token = token;
    this.requestTimeoutMs = this.secondsToMilliseconds(
      this.readIntegrationOptions(integration)?.requestTimeoutSeconds,
      DEFAULT_REQUEST_TIMEOUT_MS
    );

    if (this.serverType === 'official' && !this.token) {
      throw new Error('MinerU official API requires an access token');
    }
  }

  /**
   * Create a MinerU extraction task. For self-hosted deployments the file will be uploaded immediately
   * and the parsed result cached locally, while official deployments follow the async task lifecycle.
   */
  async createTask(options: CreateTaskOptions): Promise<{ taskId: string }> {
    if (this.serverType === 'self-hosted') {
      return this.createSelfHostedTask(options);
    }

    if (!options.url) {
      throw new Error('MinerU official URL task requires a public document URL');
    }

    return this.createOfficialTask(options);
  }

  /**
   * Create a batch MinerU extraction task. Only supported for official MinerU deployments.
   */
  async createBatchTask(options: CreateBatchTaskOptions): Promise<{ batchId: string; fileUrls?: string[] }> {
    this.ensureOfficial('createBatchTask');

    const url = this.buildApiUrl('extract', 'task', 'batch');
    const body: Record<string, any> = {
      files: options.files.map((file) => {
        const entry: Record<string, any> = { url: file.url };
        if (file.isOcr !== undefined) entry.is_ocr = file.isOcr;
        if (file.dataId) entry.data_id = file.dataId;
        if (file.pageRanges) entry.page_ranges = file.pageRanges;
        return entry;
      }),
    };

    if (options.enableFormula !== undefined) body.enable_formula = options.enableFormula;
    if (options.enableTable !== undefined) body.enable_table = options.enableTable;
    if (options.language) body.language = options.language;
    if (options.modelVersion) body.model_version = options.modelVersion;
    if (options.extraFormats) body.extra_formats = options.extraFormats;
    if (options.callbackUrl) body.callback = options.callbackUrl;
    if (options.seed) body.seed = options.seed;

    const data = await this.officialRequest('create URL batch task', () =>
      axios.post<MineruTaskResult>(url, body, {
        headers: this.getOfficialHeaders(),
        timeout: this.requestTimeoutMs,
      })
    );
    return { batchId: data.data.batch_id, fileUrls: data.data.file_urls };
  }

  /**
   * Apply for signed upload URLs and upload local workspace files. MinerU starts
   * extraction automatically after each PUT completes.
   */
  async createUploadBatch(options: CreateUploadBatchOptions): Promise<{ batchId: string }> {
    this.ensureOfficial('createUploadBatch');
    if (!options.files.length) throw new Error('MinerU upload batch requires at least one file');
    if (options.files.length > MAX_OFFICIAL_UPLOAD_FILES) {
      throw new Error(`MinerU accepts at most ${MAX_OFFICIAL_UPLOAD_FILES} files in one upload batch`);
    }

    const url = this.buildApiUrl('file-urls', 'batch');
    const body: Record<string, any> = {
      files: options.files.map((file) => {
        const entry: Record<string, any> = { name: file.name };
        if (file.isOcr !== undefined) entry.is_ocr = file.isOcr;
        if (file.dataId) entry.data_id = file.dataId;
        if (file.pageRanges) entry.page_ranges = file.pageRanges;
        return entry;
      }),
    };
    if (options.enableFormula !== undefined) body.enable_formula = options.enableFormula;
    if (options.enableTable !== undefined) body.enable_table = options.enableTable;
    if (options.language) body.language = options.language;
    if (options.modelVersion) body.model_version = options.modelVersion;
    if (options.extraFormats) body.extra_formats = options.extraFormats;
    if (options.callbackUrl) body.callback = options.callbackUrl;
    if (options.seed) body.seed = options.seed;

    const data = await this.officialRequest('create file upload batch', () =>
      axios.post<MineruTaskResult>(url, body, {
        headers: this.getOfficialHeaders(),
        timeout: this.requestTimeoutMs,
      })
    );
    const batchId = data.data?.batch_id as string | undefined;
    const fileUrls = data.data?.file_urls as string[] | undefined;
    if (!batchId || !Array.isArray(fileUrls) || fileUrls.length !== options.files.length) {
      throw new MinerUApiError('MinerU returned an incomplete signed-upload response', {
        operation: 'create file upload batch',
        code: data.code,
        traceId: data.trace_id,
        batchId,
      });
    }

    for (let index = 0; index < options.files.length; index += 1) {
      await this.uploadSignedFile(fileUrls[index], options.files[index]);
    }
    return { batchId };
  }

  getSelfHostedTask(taskId: string): MineruSelfHostedTaskResult | undefined {
    if (this.serverType !== 'self-hosted') {
      throw new Error('getSelfHostedTask is only available for self-hosted MinerU deployments');
    }
    return this.localTasks.get(taskId);
  }

  /**
   * Query offical task status or results.
   */
  async getTaskResult(taskId: string, options?: TaskResultOptions): Promise<{
    full_zip_url?: string;
    state?: string;
    err_msg?: string;
    err_code?: number | string;
  }> {
    const url = this.buildApiUrl('extract', 'task', taskId);
    const params: Record<string, any> = {};
    if (options?.enableFormula !== undefined) params.enable_formula = options.enableFormula;
    if (options?.enableTable !== undefined) params.enable_table = options.enableTable;
    if (options?.language) params.language = options.language;

    const data = await this.officialRequest('get task result', () =>
      axios.get<MineruTaskResult>(url, {
        headers: this.getOfficialHeaders(),
        params,
        timeout: this.requestTimeoutMs,
      })
    );
    return data.data;
  }

  /**
   * Query batch task results. Only supported for official MinerU deployments.
   */
  async getBatchResult(batchId: string): Promise<MineruBatchResult> {
    this.ensureOfficial('getBatchResult');

    const url = this.buildApiUrl('extract-results', 'batch', batchId);
    const data = await this.officialRequest('get batch result', () =>
      axios.get<MineruTaskResult>(url, {
        headers: this.getOfficialHeaders(),
        timeout: this.requestTimeoutMs,
      })
    );
    return data.data as MineruBatchResult;
  }

  /**
   * Wait for a task to complete and return the result when available.
   */
  async waitForTask(taskId: string, timeoutMs = 5 * 60 * 1000, intervalMs = 5000): Promise<any> {
    if (this.serverType === 'self-hosted') {
      throw new Error('waitForTask is not supported for self-hosted MinerU deployments');
    }
    
    const start = Date.now();
    while (true) {
      const result = await this.getTaskResult(taskId);
      if (result?.state === 'failed') {
        throw new MinerUApiError(
          this.formatFailureMessage('MinerU task failed', result.err_msg, result.err_code, { taskId }),
          { operation: 'wait for task', code: result.err_code }
        );
      }
      if (result?.state === 'done') {
        if (!result.full_zip_url) {
          throw new MinerUApiError('MinerU task completed without full_zip_url', {
            operation: 'wait for task',
          });
        }
        return result;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`MinerU waitForTask timeout after ${timeoutMs} ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async waitForBatch(
    batchId: string,
    expectedFiles: number,
    timeoutMs = 30 * 60 * 1000,
    intervalMs = 5000
  ): Promise<MineruBatchExtractResult[]> {
    this.ensureOfficial('waitForBatch');
    const start = Date.now();
    while (true) {
      const result = await this.getBatchResult(batchId);
      const files = Array.isArray(result?.extract_result) ? result.extract_result : [];
      const failed = files.find((file) => file.state === 'failed');
      if (failed) {
        throw new MinerUApiError(
          this.formatFailureMessage('MinerU batch file failed', failed.err_msg, failed.err_code, {
            batchId,
            fileName: failed.file_name,
          }),
          {
            operation: 'wait for batch',
            code: failed.err_code,
            batchId,
            fileName: failed.file_name,
          }
        );
      }

      if (files.length === expectedFiles && files.every((file) => file.state === 'done')) {
        const incomplete = files.find((file) => !file.full_zip_url);
        if (incomplete) {
          throw new MinerUApiError('MinerU batch completed without full_zip_url', {
            operation: 'wait for batch',
            batchId,
            fileName: incomplete.file_name,
          });
        }
        return files;
      }

      if (Date.now() - start > timeoutMs) {
        throw new MinerUApiError(`MinerU batch timed out after ${timeoutMs} ms [batchId=${batchId}]`, {
          operation: 'wait for batch',
          batchId,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  private ensureOfficial(feature: string): void {
    if (this.serverType !== 'official') {
      throw new Error(`${feature} is only supported for official MinerU deployments`);
    }
  }

  private resolveServerType(integration?: Partial<IIntegration<MinerUIntegrationOptions>>): MinerUServerType {
    const integrationType = this.readIntegrationOptions(integration)?.serverType as MinerUServerType | undefined;
    if (integrationType === 'self-hosted' || integrationType === 'official') {
      return integrationType;
    }

    const envValue = this.configService.get<string>(ENV_MINERU_SERVER_TYPE)?.toLowerCase();
    if (envValue === 'self-hosted') {
      return 'self-hosted';
    }

    return 'official';
  }

  private resolveCredentials(integration?: Partial<IIntegration<MinerUIntegrationOptions>>): {
    baseUrl?: string;
    token?: string;
  } {
    const options = this.readIntegrationOptions(integration);
    const baseUrlFromIntegration = options?.apiUrl;
    const tokenFromIntegration = options?.apiKey;

    const baseUrlEnvKey =
      this.serverType === 'self-hosted' ? ENV_MINERU_API_BASE_URL : ENV_MINERU_API_BASE_URL;
    const tokenEnvKey =
      this.serverType === 'self-hosted' ? ENV_MINERU_API_TOKEN : ENV_MINERU_API_TOKEN;

    const baseUrlFromEnv = this.configService.get<string>(baseUrlEnvKey);
    const tokenFromEnv = this.configService.get<string>(tokenEnvKey);

    const baseUrl =
      baseUrlFromIntegration ||
      baseUrlFromEnv ||
      (this.serverType === 'official' ? DEFAULT_OFFICIAL_BASE_URL : undefined);
    const token = tokenFromIntegration || tokenFromEnv;
    
    // Validate baseUrl is provided for self-hosted mode
    if (this.serverType === 'self-hosted' && !baseUrl) {
      throw new Error(
        'MinerU self-hosted mode requires apiUrl to be configured in integration options or ' +
        `${ENV_MINERU_API_BASE_URL} environment variable`
      );
    }

    return { baseUrl, token };
  }

  private readIntegrationOptions(integration?: Partial<IIntegration<MinerUIntegrationOptions>>): MinerUIntegrationOptions | undefined {
    return (integration?.options as MinerUIntegrationOptions) || undefined;
  }

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private buildApiUrl(...segments: string[]): string {
    const path = segments
      .filter(Boolean)
      .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
      .join('/');
    return path ? `${this.baseUrl}/${path}` : this.baseUrl;
  }

  private getOfficialHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  private getSelfHostedHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async createOfficialTask(options: CreateTaskOptions): Promise<{ taskId: string }> {
    const url = this.buildApiUrl('extract', 'task');
    const body: Record<string, any> = { url: options.url };

    if (options.isOcr !== undefined) body.is_ocr = options.isOcr;
    if (options.enableFormula !== undefined) body.enable_formula = options.enableFormula;
    if (options.enableTable !== undefined) body.enable_table = options.enableTable;
    if (options.language) body.language = options.language;
    if (options.modelVersion) body.model_version = options.modelVersion;
    if (options.dataId) body.data_id = options.dataId;
    if (options.pageRanges) body.page_ranges = options.pageRanges;
    if (options.extraFormats) body.extra_formats = options.extraFormats;
    if (options.callbackUrl) body.callback = options.callbackUrl;
    if (options.seed) body.seed = options.seed;
    if (options.noCache !== undefined) body.no_cache = options.noCache;
    if (options.cacheTolerance !== undefined) body.cache_tolerance = options.cacheTolerance;

    const data = await this.officialRequest('create task', () =>
      axios.post<MineruTaskResult>(url, body, {
        headers: this.getOfficialHeaders(),
        timeout: this.requestTimeoutMs,
      })
    );
    return { taskId: data.data.task_id };
  }

  private async createSelfHostedTask(options: CreateTaskOptions): Promise<{ taskId: string }> {
    if (!this.fileSystem) {
      throw new Error('MinerU self-hosted mode requires fileSystem permission');
    }
    if (!options.filePath) {
      throw new Error('MinerU self-hosted mode requires filePath to be provided');
    }
    const buffer = await this.fileSystem.readFile(options.filePath);
    if (!buffer.length) throw new Error(`MinerU source file is empty: ${options.filePath}`);

    const taskId = randomUUID();
    const result = await this.invokeSelfHostedParse(
      buffer,
      options.fileName || basename(options.filePath),
      options
    );
    this.localTasks.set(taskId, { ...result, sourceUrl: options.url });

    return { taskId };
  }

  private async invokeSelfHostedParse(
    buffer: Buffer,
    fileName: string,
    options: CreateTaskOptions,
  ): Promise<MineruSelfHostedTaskResult> {
    const parseUrl = this.buildApiUrl('file_parse');
    this.logger.debug(`Sending parse request to: ${parseUrl}, file: ${fileName}`);

    let response = await this.postSelfHostedParse(parseUrl, buffer, fileName, options, 'files');

    if (this.isSelfHostedApiV1(response)) {
      return this.invokeSelfHostedParseV1(buffer, fileName, options);
    }

    if (this.isSelfHostedFileInputMissing(response)) {
      this.logger.debug('Retrying MinerU self-hosted parse with singular file field');
      response = await this.postSelfHostedParse(parseUrl, buffer, fileName, options, 'file');
      if (this.isSelfHostedApiV1(response)) {
        return this.invokeSelfHostedParseV1(buffer, fileName, options);
      }
    }

    if (response.status === 400) {
      const errorMessage = this.getResponseErrorMessage(response);
      this.logger.error(`MinerU self-hosted parse failed with 400: ${errorMessage}`, JSON.stringify(response.data));
      throw new BadRequestException(
        `MinerU self-hosted parse failed: ${response.status} ${errorMessage}`
      )
    }

    if (response.status !== 200) {
      const errorMessage = getErrorMessage(response.data) || response.statusText;
      const errorDetails = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      
      this.logger.error(
        `MinerU self-hosted parse failed with ${response.status}: ${errorMessage}`,
        `Request URL: ${parseUrl}, File: ${fileName}, Details: ${errorDetails}`
      );
      
      // Provide more helpful error message for common issues
      let userFriendlyMessage = `MinerU self-hosted parse failed: ${response.status} ${response.statusText}`;
      if (errorMessage) {
        userFriendlyMessage += `. ${errorMessage}`;
      }
      
      // Check for specific error patterns
      if (errorMessage && errorMessage.includes('0 active models')) {
        userFriendlyMessage += ' Please ensure MinerU service has active models configured.';
      } else if (errorMessage && errorMessage.includes('NoneType')) {
        userFriendlyMessage += ' This may indicate a configuration issue with the MinerU service.';
      }
      
      throw new Error(userFriendlyMessage);
    }

    return this.normalizeSelfHostedResponse(response.data);
  }

  private async postSelfHostedParse(
    parseUrl: string,
    buffer: Buffer,
    fileName: string,
    options: CreateTaskOptions,
    fileField: SelfHostedFileField,
  ): Promise<AxiosResponse> {
    const form = this.createSelfHostedParseForm(buffer, fileName, options, fileField);
    const headers = {
      ...this.getSelfHostedHeaders(),
      ...form.getHeaders(),
    };

    return axios.post(parseUrl, form, {
      headers,
      maxBodyLength: Infinity,
      timeout: this.requestTimeoutMs,
      validateStatus: () => true,
    });
  }

  private createSelfHostedParseForm(
    buffer: Buffer,
    fileName: string,
    options: CreateTaskOptions,
    fileField: SelfHostedFileField,
  ): FormData {
    const form = this.createSelfHostedFileForm(buffer, fileName, fileField);
    form.append('parse_method', options.parseMethod ?? 'auto');
    form.append('return_md', 'true');
    form.append('return_model_output', 'false');
    form.append('return_content_list', 'true');
    if (options.language) form.append('lang_list', options.language);
    form.append('return_images', 'true');
    form.append('backend', options.backend ?? options.modelVersion ?? 'pipeline');
    form.append('formula_enable', this.booleanToString(options.enableFormula ?? true));
    form.append('table_enable', this.booleanToString(options.enableTable ?? true));
    form.append('return_middle_json', this.booleanToString(options.returnMiddleJson ?? false));
    if (options.serverUrl) {
      form.append('server_url', options.serverUrl);
    }
    return form;
  }

  private createSelfHostedFileForm(buffer: Buffer, fileName: string, fileField: SelfHostedFileField): FormData {
    const form = new FormData();
    form.append(fileField, buffer, { filename: fileName });
    return form;
  }

  private async invokeSelfHostedParseV1(
    buffer: Buffer,
    fileName: string,
    options: CreateTaskOptions,
  ): Promise<MineruSelfHostedTaskResult> {
    const parseUrl = this.buildApiUrl('file_parse');
    const form = this.createSelfHostedFileForm(buffer, fileName, 'file');

    const params = {
      parse_method: options.parseMethod ?? 'auto',
      return_layout: false,
      return_info: false,
      return_content_list: true,
      return_images: true,
    };

    const headers = {
      ...this.getSelfHostedHeaders(),
      ...form.getHeaders(),
    };

    try {
      const response = await axios.post(parseUrl, form, {
        headers,
        params,
        maxBodyLength: Infinity,
        timeout: this.requestTimeoutMs,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        const errorMessage = getErrorMessage(response.data) || response.statusText;
        this.logger.error(
          `MinerU self-hosted legacy parse failed with ${response.status}: ${errorMessage}`,
          JSON.stringify(response.data)
        );
        throw new Error(
          `MinerU self-hosted legacy parse failed: ${response.status} ${response.statusText}. ${errorMessage}`
        );
      }

      return this.normalizeSelfHostedResponse(response.data);
    } catch (error) {
      this.logger.error('invokeSelfHostedParseV1 error', error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  private isSelfHostedApiV1(response: AxiosResponse): boolean {
    if (response.status !== 422) {
      return false;
    }

    const detail = (response.data as any)?.detail;
    if (!Array.isArray(detail)) {
      return false;
    }

    return detail.some((item) => {
      const loc = item?.loc;
      return item?.type === 'missing' && Array.isArray(loc) && loc[0] === 'body' && loc[1] === 'file';
    });
  }

  private isSelfHostedFileInputMissing(response: AxiosResponse): boolean {
    if (response.status !== 400) {
      return false;
    }

    const errorMessage = this.getResponseErrorMessage(response);
    return errorMessage.includes('Must provide either file or file_path') || errorMessage.includes('file or file_path');
  }

  private getResponseErrorMessage(response: AxiosResponse): string {
    const directMessage = getErrorMessage(response.data);
    if (directMessage) {
      return directMessage;
    }

    return response.statusText;
  }

  private normalizeSelfHostedResponse(payload: any): MineruSelfHostedTaskResult {
    if (!payload) {
      throw new Error('MinerU self-hosted parse returned empty payload');
    }

    if (payload.results && typeof payload.results === 'object') {
      const [firstKey] = Object.keys(payload.results);
      if (firstKey) {
        return this.normalizeSelfHostedFileResult(payload.results[firstKey], firstKey);
      }
    }

    return this.normalizeSelfHostedFileResult(payload);
  }

  private normalizeSelfHostedFileResult(result: any, fileName?: string): MineruSelfHostedTaskResult {
    const mdContent = result?.md_content ?? '';
    const contentList = this.parseJsonSafe(result?.content_list);
    const contentListV2 = this.parseJsonSafe(result?.content_list_v2);
    const images = this.normalizeImageMap(result?.images);

    return {
      mdContent,
      contentList,
      contentListV2,
      images,
      raw: result,
      fileName,
    };
  }

  private normalizeImageMap(map: Record<string, string> | undefined): MineruSelfHostedImage[] {
    if (!map) {
      return [];
    }

    return Object.entries(map).map(([name, dataUrl]) => ({ name, dataUrl }));
  }

  private parseJsonSafe(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to parse MinerU content_list JSON: ${message}`);
      return value;
    }
  }

  private booleanToString(value: boolean): string {
    return value ? 'true' : 'false';
  }

  private async uploadSignedFile(url: string, file: CreateUploadBatchFile): Promise<void> {
    await this.retryRequest(`upload '${file.name}'`, async () => {
      await axios.put(url, file.buffer, {
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: this.requestTimeoutMs,
      });
    });
  }

  private async officialRequest(
    operation: string,
    request: () => Promise<AxiosResponse<MineruTaskResult>>
  ): Promise<MineruTaskResult> {
    return this.retryRequest(operation, async () => {
      let response: AxiosResponse<MineruTaskResult>;
      try {
        response = await request();
      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new MinerUApiError(
            this.formatFailureMessage(
              `MinerU ${operation} failed`,
              getErrorMessage(error.response?.data) || error.message,
              (error.response?.data as MineruTaskResult | undefined)?.code,
              {
                status: error.response?.status,
                traceId: (error.response?.data as MineruTaskResult | undefined)?.trace_id,
              }
            ),
            {
              operation,
              code: (error.response?.data as MineruTaskResult | undefined)?.code,
              traceId: (error.response?.data as MineruTaskResult | undefined)?.trace_id,
              httpStatus: error.response?.status,
            }
          );
        }
        throw error;
      }

      const data = response.data;
      if (String(data?.code) !== '0') {
        throw new MinerUApiError(
          this.formatFailureMessage(`MinerU ${operation} failed`, data?.msg, data?.code, {
            status: response.status,
            traceId: data?.trace_id,
          }),
          {
            operation,
            code: data?.code,
            traceId: data?.trace_id,
            httpStatus: response.status,
          }
        );
      }
      return data;
    });
  }

  private async retryRequest<T>(operation: string, request: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !this.isRetryableError(error)) throw error;
        this.logger.warn(`MinerU ${operation} transient failure; retrying (${attempt}/${attempts})`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof MinerUApiError) {
      if (error.details.httpStatus && RETRYABLE_HTTP_STATUS.has(error.details.httpStatus)) return true;
      if (error.details.code && RETRYABLE_API_CODES.has(String(error.details.code))) return true;
      return false;
    }
    if (!axios.isAxiosError(error)) return false;
    if (!error.response) return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error.code || '');
    return RETRYABLE_HTTP_STATUS.has(error.response.status);
  }

  private formatFailureMessage(
    prefix: string,
    detail?: string,
    code?: number | string,
    context: Record<string, unknown> = {}
  ): string {
    const tags = [
      code !== undefined ? `code=${code}` : undefined,
      ...Object.entries(context)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${key}=${String(value)}`),
    ].filter(Boolean);
    return `${prefix}${detail ? `: ${detail}` : ''}${tags.length ? ` [${tags.join(', ')}]` : ''}`;
  }

  private secondsToMilliseconds(value: number | undefined, fallback: number): number {
    if (!Number.isFinite(value) || Number(value) <= 0) return fallback;
    return Math.floor(Number(value) * 1000);
  }

  getSelfHostedOpenApiSpec(): Promise<AxiosResponse<any, any>> {
    const url = this.buildApiUrl('openapi.json');
    return axios.get(url, {
      headers: this.getSelfHostedHeaders(),
      timeout: this.requestTimeoutMs,
      validateStatus: () => true,
    });
  }

  async validateOfficialApiToken() {
    const url = this.buildApiUrl('extract', 'task', '00000000-0000-0000-0000-000000000000');
    const response = await axios.get<MineruTaskResult>(url, {
      headers: this.getOfficialHeaders(),
      timeout: this.requestTimeoutMs,
      validateStatus: () => true,
    });
    if (response.status === 401 || response.status === 403 || ['A0202', 'A0211'].includes(String(response.data?.code))) {
      throw new BadRequestException('MinerU official access token is invalid or expired');
    }
    if (response.status >= 500) {
      throw new BadRequestException(`MinerU official API is unavailable (HTTP ${response.status})`);
    }
    if (String(response.data?.code) !== '-60012' && String(response.data?.code) !== '0') {
      throw new BadRequestException(
        this.formatFailureMessage('MinerU official API validation failed', response.data?.msg, response.data?.code, {
          status: response.status,
          traceId: response.data?.trace_id,
        })
      );
    }
  }

  async validateSelfHostedService(): Promise<void> {
    const healthUrl = this.buildApiUrl('health');
    const health = await axios.get(healthUrl, {
      headers: this.getSelfHostedHeaders(),
      timeout: this.requestTimeoutMs,
      validateStatus: () => true,
    });
    if (health.status >= 200 && health.status < 300) return;

    const spec = await this.getSelfHostedOpenApiSpec();
    if (spec.status < 200 || spec.status >= 300) {
      throw new BadRequestException(`MinerU self-hosted service validation failed (HTTP ${spec.status})`);
    }
  }
}
