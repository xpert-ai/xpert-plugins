import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools';
import { BuiltinToolset, XpFileSystem } from '@xpert-ai/plugin-sdk';
import { ConfigService } from '@nestjs/config';
import { MinerUResultParserService } from './result-parser.service.js';
import { buildMinerUTool } from './mineru.tool.js';
import { MinerUIntegrationOptions } from './types.js';

/**
 * Configuration for MinerU Toolset
 */
export interface MinerUToolsetConfig {
  /**
   * MinerU API options stored in toolset credentials
   */
  apiUrl?: string;
  apiKey?: string;
  fileSystem?: XpFileSystem;
  configService?: ConfigService;
  resultParser?: MinerUResultParserService;
  // Default parsing settings (optional, can be overridden when calling the tool)
  // Support both string ('true'/'false') and boolean types for backward compatibility
  isOcr?: boolean | string;
  enableFormula?: boolean | string;
  enableTable?: boolean | string;
  language?: 'en' | 'ch';
  modelVersion?: 'pipeline' | 'vlm';
}

/**
 * MinerU Toolset implementation
 * Provides PDF to markdown conversion tool using MinerU service
 */
export class MinerUToolset extends BuiltinToolset<StructuredToolInterface, MinerUToolsetConfig> {
  private readonly config: MinerUToolsetConfig;
  // Ensure `tools` exists even if upstream BuiltinToolset typings differ across versions.
  override tools: any[] = [];

  /**
   * Constructor for MinerU Toolset
   * Accepts config which contains credentials and dependencies
   * Note: Using 'as any' for params because TBuiltinToolsetParams requires system-provided
   * properties (tenantId, env) that are added at runtime
   */
  constructor(config: MinerUToolsetConfig) {
    super('mineru', undefined, config as any);
    this.config = config;
    // Log config received in constructor (mask apiKey for security)
    const configForLog = { ...config };
    if (configForLog.apiKey) {
      configForLog.apiKey = configForLog.apiKey.length > 8 
        ? `${configForLog.apiKey.substring(0, 4)}...${configForLog.apiKey.substring(configForLog.apiKey.length - 4)}`
        : '***';
    }
    // Use base class logger (protected access)
    if ('logger' in this && this.logger) {
      (this.logger as any).log(`[MinerU] MinerUToolset constructor received config: ${JSON.stringify(configForLog, null, 2)}`);
    }
  }

  /**
   * Validate credentials for MinerU toolset
   * Note: During authorization phase, credentials may be incomplete.
   * configService and resultParser are runtime dependencies injected by the strategy.
   * We don't validate anything here to allow authorization to proceed.
   */
  override async _validateCredentials(credentials: MinerUToolsetConfig): Promise<void> {
    // No validation needed during authorization phase
    // API key validity will be enforced by MinerU server when tool is used
  }

  /**
   * Initialize tools for MinerU toolset
   * Creates the PDF parser tool with necessary dependencies
   */
  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    const { configService, resultParser, apiUrl, apiKey, fileSystem, isOcr, enableFormula, enableTable, language, modelVersion } = this.config;
    
    // Log config before destructuring
    const configKeys = Object.keys(this.config);
    const hasApiKey = 'apiKey' in this.config;
    const apiKeyValue = this.config.apiKey;
    const maskedApiKey = apiKeyValue 
      ? (apiKeyValue.length > 8 ? `${apiKeyValue.substring(0, 4)}...${apiKeyValue.substring(apiKeyValue.length - 4)}` : '***')
      : 'missing';
    // Use base class logger (protected access)
    if ('logger' in this && this.logger) {
      (this.logger as any).log(`[MinerU] MinerUToolset.initTools() - config keys: ${configKeys.join(', ')}, hasApiKey: ${hasApiKey}, apiKey: ${maskedApiKey}`);
      (this.logger as any).log(`[MinerU] MinerUToolset.initTools() - destructured apiKey: ${apiKey ? (apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : '***') : 'missing'}`);
    }
    
    if (!configService || !resultParser) {
      throw new Error('ConfigService and MinerUResultParserService are required');
    }
    
    // Use configuration from authorization page
    // apiUrl: use provided value or default to official server URL
    const finalApiUrl = apiUrl || 'https://mineru.net/api/v4';
    
    // Convert string enum values to boolean (compatible with 'true'/'false' strings and boolean values)
    // Use provided values from authorization page, or default to true
    const finalIsOcr = isOcr === 'true' || isOcr === true;
    const finalEnableFormula = enableFormula === 'true' || enableFormula === true;
    const finalEnableTable = enableTable === 'true' || enableTable === true;
    
    // Use provided values from authorization page, or use defaults
    const finalLanguage = language || 'ch';
    const finalModelVersion = modelVersion || 'pipeline';
    
    // Log what we're passing to buildMinerUTool
    const maskedFinalApiKey = apiKey 
      ? (apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : '***')
      : 'missing';
    // Use base class logger (protected access)
    if ('logger' in this && this.logger) {
      (this.logger as any).log(`[MinerU] MinerUToolset.initTools() - passing to buildMinerUTool: apiUrl=${finalApiUrl}, apiKey=${maskedFinalApiKey}`);
    }
    
    this.tools = [
      buildMinerUTool(
        configService,
        resultParser,
        {
          apiUrl: finalApiUrl,
          apiKey, // apiKey is required and validated in authorization page
        },
        fileSystem,
        {
          isOcr: finalIsOcr,
          enableFormula: finalEnableFormula,
          enableTable: finalEnableTable,
          language: finalLanguage,
          modelVersion: finalModelVersion,
        }
      ),
    ];
    return this.tools;
  }
}

