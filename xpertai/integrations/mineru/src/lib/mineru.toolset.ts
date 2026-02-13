import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools';
import { BuiltinToolset, XpFileSystem } from '@xpert-ai/plugin-sdk';
import { ConfigService } from '@nestjs/config';
import { MinerUResultParserService } from './result-parser.service.js';
import { buildMinerUTool } from './mineru.tool.js';
import { MinerUIntegrationOptions } from './types.js';

export interface MinerUToolsetConfig {
  apiUrl?: string;
  apiKey?: string;
  extraFormats?: string | string[];
  fileSystem?: XpFileSystem;
  configService?: ConfigService;
  resultParser?: MinerUResultParserService;
  isOcr?: boolean | string;
  enableFormula?: boolean | string;
  enableTable?: boolean | string;
  language?: 'en' | 'ch';
  modelVersion?: 'pipeline' | 'vlm';
  returnJson?: boolean | string;
  includeNonImageFiles?: boolean | string;
}

export class MinerUToolset extends BuiltinToolset<StructuredToolInterface, MinerUToolsetConfig> {
  private readonly config: MinerUToolsetConfig;
  override tools: any[] = [];

  constructor(config: MinerUToolsetConfig) {
    super('mineru', undefined, config as any);
    this.config = config;
    const configForLog = { ...config };
    if (configForLog.apiKey) {
      configForLog.apiKey =
        configForLog.apiKey.length > 8
          ? `${configForLog.apiKey.substring(0, 4)}...${configForLog.apiKey.substring(configForLog.apiKey.length - 4)}`
          : '***';
    }
    if ('logger' in this && this.logger) {
      (this.logger as any).log(
        `[MinerU] MinerUToolset constructor received config: ${JSON.stringify(configForLog, null, 2)}`
      );
    }
  }

  override async _validateCredentials(_credentials: MinerUToolsetConfig): Promise<void> {
    // No validation during authorization phase.
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    const {
      configService,
      resultParser,
      apiUrl,
      apiKey,
      extraFormats,
      fileSystem,
      isOcr,
      enableFormula,
      enableTable,
      language,
      modelVersion,
      returnJson,
      includeNonImageFiles,
    } = this.config;

    if (!configService || !resultParser) {
      throw new Error('ConfigService and MinerUResultParserService are required');
    }

    const finalApiUrl = apiUrl || 'https://mineru.net/api/v4';
    const finalIsOcr = isOcr === 'true' || isOcr === true;
    const finalEnableFormula = enableFormula === 'true' || enableFormula === true;
    const finalEnableTable = enableTable === 'true' || enableTable === true;
    const finalLanguage = language || 'ch';
    const finalModelVersion = modelVersion || 'pipeline';

    this.tools = [
      buildMinerUTool(
        configService,
        resultParser,
        {
          apiUrl: finalApiUrl,
          apiKey,
          extraFormats,
        } as MinerUIntegrationOptions,
        fileSystem,
        {
          isOcr: finalIsOcr,
          enableFormula: finalEnableFormula,
          enableTable: finalEnableTable,
          language: finalLanguage,
          modelVersion: finalModelVersion,
          returnJson,
          includeNonImageFiles,
        }
      ),
    ];
    return this.tools;
  }
}
