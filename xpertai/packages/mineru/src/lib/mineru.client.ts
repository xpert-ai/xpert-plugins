import { IIntegration } from '@metad/contracts';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage, XpFileSystem } from '@xpert-ai/plugin-sdk';
import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import { randomUUID } from 'crypto';
import { basename } from 'path';
import fs from 'fs';
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

interface TaskResultOptions {
  enableFormula?: boolean;
  enableTable?: boolean;
  language?: string;
}

interface MineruTaskResult {
  code: number;
  msg: string;
  trace_id: string;
  data: any;
}

export class MinerUClient {
  private readonly logger = new Logger(MinerUClient.name);
  private readonly baseUrl: string;
  private readonly token?: string;
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

    if (this.serverType === 'official' && !this.token) {
      throw new Error('MinerU official API requires an access token');
    }
  }

  /**
   * Create a MinerU extraction task. For self-hosted deployments the file will be uploaded immediately
   * and the parsed result cached locally, while official deployments follow the async task lifecycle.
   */
  async createTask(options: CreateTaskOptions): Promise<{ taskId: string }> {
    if (!options.url) {
      throw new Error('MinerU createTask requires a document URL');
    }

    if (this.serverType === 'self-hosted') {
      return this.createSelfHostedTask(options);
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

    try {
      const resp = await axios.post(url, body, { headers: this.getOfficialHeaders() });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`MinerU createBatchTask failed: ${data.msg}`);
      }
      return { batchId: data.data.batch_id, fileUrls: data.data.file_urls };
    } catch (err) {
      this.logger.error('createBatchTask error', err instanceof Error ? err.stack : err);
      throw err;
    }
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
    full_url?: string;
    content?: string;
    status?: string;
  }> {
    const url = this.buildApiUrl('extract', 'task', taskId);
    const params: Record<string, any> = {};
    if (options?.enableFormula !== undefined) params.enable_formula = options.enableFormula;
    if (options?.enableTable !== undefined) params.enable_table = options.enableTable;
    if (options?.language) params.language = options.language;

    try {
      const resp = await axios.get(url, { headers: this.getOfficialHeaders(), params });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`MinerU getTaskResult failed: ${data.msg}`);
      }
      return data.data;
    } catch (err) {
      this.logger.error('getTaskResult error', err instanceof Error ? err.stack : err);
      throw err;
    }
  }

  /**
   * Query batch task results. Only supported for official MinerU deployments.
   */
  async getBatchResult(batchId: string): Promise<any> {
    this.ensureOfficial('getBatchResult');

    const url = this.buildApiUrl('extract-results', 'batch', batchId);
    try {
      const resp = await axios.get(url, { headers: this.getOfficialHeaders() });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`MinerU getBatchResult failed: ${data.msg}`);
      }
      return data.data;
    } catch (err) {
      this.logger.error('getBatchResult error', err instanceof Error ? err.stack : err);
      throw err;
    }
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
      this.logger.debug(`MinerU waiting task result: ${JSON.stringify(result)}`);

      if (result?.full_zip_url || result?.full_url || result?.content || result?.status === 'done') {
        return result;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`MinerU waitForTask timeout after ${timeoutMs} ms`);
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
      (this.serverType === 'official' ? DEFAULT_OFFICIAL_BASE_URL : null);
    const token = tokenFromIntegration || tokenFromEnv;

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

    try {
      const resp = await axios.post(url, body, { headers: this.getOfficialHeaders() });
      const data = resp.data as MineruTaskResult;
      if (data.code !== 0) {
        throw new Error(`MinerU createTask failed: ${data.msg}`);
      }
      return { taskId: data.data.task_id };
    } catch (err) {
      this.logger.error('createTask error', err instanceof Error ? err.stack : err);
      throw err;
    }
  }

  private async createSelfHostedTask(options: CreateTaskOptions): Promise<{ taskId: string }> {
    const filePath = this.fileSystem.fullPath(options.filePath);
    const taskId = randomUUID();
    const result = await this.invokeSelfHostedParse(filePath, options.fileName, options);
    this.localTasks.set(taskId, { ...result, sourceUrl: options.url });

    return { taskId };
  }

  private async invokeSelfHostedParse(
    filePath: string,
    fileName: string,
    options: CreateTaskOptions,
  ): Promise<MineruSelfHostedTaskResult> {
    const parseUrl = this.buildApiUrl('file_parse');
    const form = new FormData();
    form.append(
      'files',
      fs.createReadStream(filePath),
      {
        filename: fileName,
      },
    );
    // form.append('files', fileBuffer, { filename: fileName, contentType: contentType || 'application/pdf' });
    form.append('parse_method', options.parseMethod ?? 'auto');
    form.append('return_md', 'true');
    form.append('return_model_output', 'false');
    form.append('return_content_list', 'true');
    // form.append('lang_list', JSON.stringify(this.buildLanguageList(options.language)));
    form.append('return_images', 'true');
    form.append('backend', options.backend ?? options.modelVersion ?? 'pipeline');
    form.append('formula_enable', this.booleanToString(options.enableFormula ?? true));
    form.append('table_enable', this.booleanToString(options.enableTable ?? true));
    form.append('return_middle_json', this.booleanToString(options.returnMiddleJson ?? false));
    if (options.serverUrl) {
      form.append('server_url', options.serverUrl);
    }

    const headers = {
      ...this.getSelfHostedHeaders(),
      ...form.getHeaders(),
    };

    const response = await axios.post(parseUrl, form, {
      headers,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });

    if (this.isSelfHostedApiV1(response)) {
      return this.invokeSelfHostedParseV1(filePath, fileName, options);
    }

    if (response.status === 400) {
      throw new BadRequestException(
        `MinerU self-hosted parse failed: ${response.status} ${getErrorMessage(response.data)}`
      )
    }

    if (response.status !== 200) {
      console.error(response.data)
      throw new Error(`MinerU self-hosted parse failed: ${response.status} ${response.statusText}`);
    }

    return this.normalizeSelfHostedResponse(response.data);
  }

  private async invokeSelfHostedParseV1(
    filePath: string,
    fileName: string,
    options: CreateTaskOptions,
  ): Promise<MineruSelfHostedTaskResult> {
    const parseUrl = this.buildApiUrl('file_parse');
    const form = new FormData();
    form.append(
      'files',
      fs.createReadStream(filePath),
      {
        filename: fileName,
      },
    );

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
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        throw new Error(`MinerU self-hosted legacy parse failed: ${response.status} ${response.statusText}`);
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
    const images = this.normalizeImageMap(result?.images);

    return {
      mdContent,
      contentList,
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

  private buildLanguageList(language?: string): string[] {
    if (!language || language === 'auto') {
      return ['zh'];
    }

    return [language];
  }

  private booleanToString(value: boolean): string {
    return value ? 'true' : 'false';
  }

  private async downloadFile(url: string): Promise<{ buffer: Buffer; fileName: string; contentType?: string }> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] as string | undefined;
      const contentDisposition = response.headers['content-disposition'] as string | undefined;

      return {
        buffer,
        fileName: this.extractFileName(url, contentDisposition),
        contentType,
      };
    } catch (error) {
      this.logger.error(`Failed to download file for MinerU from ${url}`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  private extractFileName(sourceUrl: string, contentDisposition?: string): string {
    const dispositionMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition || '');
    if (dispositionMatch) {
      const encodedName = dispositionMatch[1] || dispositionMatch[2];
      if (encodedName) {
        try {
          return decodeURIComponent(encodedName);
        } catch {
          return encodedName;
        }
      }
    }

    try {
      const pathname = new URL(sourceUrl).pathname;
      const name = basename(pathname);
      if (name) {
        return name;
      }
    } catch {
      // Ignore URL parsing errors and fallback to default
    }

    return `mineru-${Date.now()}.pdf`;
  }

  getSelfHostedOpenApiSpec(): Promise<AxiosResponse<any, any>> {
    const url = this.buildApiUrl('openapi.json');
    return axios.get(url, { headers: this.getSelfHostedHeaders() });
  }

  async validateOfficialApiToken() {
    const url = this.buildApiUrl('/extract/task/xxxxxxx');
    const response = await axios.get(url, { headers: this.getOfficialHeaders() });
    if (response.status !== 200) {
      throw new BadRequestException(`MinerU official API token validation failed: ${getErrorMessage(response.data)}`);
    }
    if (response.data.code !== -60012) {
      throw new BadRequestException('MinerU official Base URL or API token is invalid');
    }
  }
}
