import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BuiltinToolset,
  IToolsetStrategy,
  ToolsetStrategy,
  FileSystemPermission,
  ISchemaSecretField,
} from '@xpert-ai/plugin-sdk';
import { MinerUResultParserService } from './result-parser.service.js';
import { MinerUToolset, MinerUToolsetConfig } from './mineru.toolset.js';
import { MinerU, icon } from './types.js';
import { buildMinerUTool } from './mineru.tool.js';

/**
 * Interface for IXpertToolset (simplified version for type checking)
 */
interface IXpertToolset {
  credentials?: any;
  [key: string]: any;
}

/**
 * ToolsetStrategy for MinerU PDF parser tool
 * Registers MinerU as a toolset that can be used in agent workflows
 */
@Injectable()
@ToolsetStrategy(MinerU)
export class MinerUToolsetStrategy implements IToolsetStrategy<MinerUToolsetConfig> {
  /**
   * Metadata for MinerU toolset
   */
  meta = {
    author: 'Xpert AI',
    tags: ['pdf', 'markdown', 'parser', 'ocr', 'mineru', 'document', 'extraction'],
    name: MinerU,
    label: {
      en_US: 'MinerU PDF Parser',
      zh_Hans: 'MinerU PDF 解析器',
    },
    description: {
      en_US:
        'Convert PDF files to markdown format using MinerU. Supports OCR, formula recognition, and table extraction.',
      zh_Hans: '使用 MinerU 将 PDF 文件转换为 Markdown 格式。支持 OCR、公式识别和表格提取。',
    },
    icon: {
      // Provide both shapes to maximize compatibility with different platform icon resolvers
      // - builtin-provider icon endpoints may look for `type/value`
      // - toolset registries may look for `svg`
      type: 'svg',
      value: icon,
      svg: icon,
      color: '#14b8a6',
    },
    configSchema: {
      type: 'object',
      properties: {
        /**
         * NOTE:
         * We intentionally keep MinerU as a "self-contained" toolset that stores its own API credentials,
         * instead of relying on the platform IntegrationPermission flow.
         *
         * Reason: during the built-in toolset authorization step, the platform may send `credentials = null`,
         * and backend may access `credentials.integration`, causing a 500 (`Cannot read properties of null (reading 'integration')`).
         * Defining API fields directly ensures the authorization UI renders fields and always submits an object.
         */
        apiUrl: {
          type: 'string',
          title: {
            en_US: 'Base URL',
            zh_Hans: 'Base URL',
          },
          description: {
            en_US: 'MinerU API base url. Official: https://mineru.net/api/v4',
            zh_Hans: 'MinerU 服务地址。官方： https://mineru.net/api/v4',
          },
          default: 'https://mineru.net/api/v4',
          // Note: apiUrl is not in required array because it's optional with a default value
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key',
            zh_Hans: 'API Key',
          },
          description: {
            en_US: 'The API Key of the MinerU server (required)',
            zh_Hans: 'MinerU 服务令牌（必填）',
          },
          'x-ui': <ISchemaSecretField>{
            component: 'secretInput',
            label: 'API Key',
            placeholder: 'MinerU API Key',
            revealable: true,
            maskSymbol: '*',
            persist: true,
          },
        },
        // Default parsing settings (optional, can be overridden when calling the tool)
        // Changed isOcr from boolean to string enum
        isOcr: {
          type: 'string',
          title: {
            en_US: 'Enable OCR',
            zh_Hans: '启用 OCR',
          },
          description: {
            en_US: 'Enable OCR for image-based PDFs',
            zh_Hans: '为基于图像的 PDF 启用 OCR',
          },
          enum: ['true', 'false'],
          default: 'true',
          'x-ui': {
            enumLabels: {
              'true': {
                en_US: 'Enabled',
                zh_Hans: '启用',
              },
              'false': {
                en_US: 'Disabled',
                zh_Hans: '禁用',
              },
            },
          },
        },
        // Changed enableFormula from boolean to string enum
        enableFormula: {
          type: 'string',
          title: {
            en_US: 'Enable Formula Recognition',
            zh_Hans: '启用公式识别',
          },
          description: {
            en_US: 'Enable formula recognition',
            zh_Hans: '启用公式识别',
          },
          enum: ['true', 'false'],
          default: 'true',
          'x-ui': {
            enumLabels: {
              'true': {
                en_US: 'Enabled',
                zh_Hans: '启用',
              },
              'false': {
                en_US: 'Disabled',
                zh_Hans: '禁用',
              },
            },
          },
        },
        // Changed enableTable from boolean to string enum
        enableTable: {
          type: 'string',
          title: {
            en_US: 'Enable Table Recognition',
            zh_Hans: '启用表格识别',
          },
          description: {
            en_US: 'Enable table recognition',
            zh_Hans: '启用表格识别',
          },
          enum: ['true', 'false'],
          default: 'true',
          'x-ui': {
            enumLabels: {
              'true': {
                en_US: 'Enabled',
                zh_Hans: '启用',
              },
              'false': {
                en_US: 'Disabled',
                zh_Hans: '禁用',
              },
            },
          },
        },
        language: {
          type: 'string',
          title: {
            en_US: 'Document Language',
            zh_Hans: '文档语言',
          },
          description: {
            en_US: 'Document language: "en" for English, "ch" for Chinese (default: "ch")',
            zh_Hans: '文档语言："en" 表示英语，"ch" 表示中文（默认："ch"）',
          },
          enum: ['en', 'ch'],
          default: 'ch',
          'x-ui': {
            enumLabels: {
              'en': {
                en_US: 'en',
                zh_Hans: '英文',
              },
              'ch': {
                en_US: 'ch',
                zh_Hans: '中文',
              },
            },
          },
        },
        modelVersion: {
          type: 'string',
          title: {
            en_US: 'Model Version',
            zh_Hans: '模型版本',
          },
          description: {
            en_US: 'Model version: "pipeline" or "vlm" (default: "pipeline")',
            zh_Hans: '模型版本："pipeline" 或 "vlm"（默认："pipeline"）',
          },
          enum: ['pipeline', 'vlm'],
          default: 'pipeline',
          'x-ui': {
            enumLabels: {
              'pipeline': {
                en_US: 'pipeline',
                zh_Hans: 'pipeline',
              },
              'vlm': {
                en_US: 'vlm',
                zh_Hans: 'vlm',
              },
            },
          },
        },
      },
      required: ['apiKey'],
    },
  };

  /**
   * Permissions required by MinerU toolset
   */
  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: [],
    } as FileSystemPermission,
  ];

  constructor(
    @Inject(forwardRef(() => ConfigService))
    private readonly configService: ConfigService,
    @Inject(MinerUResultParserService)
    private readonly resultParser: MinerUResultParserService
  ) {}

  /**
   * Validate toolset configuration
   */
  validateConfig(config: MinerUToolsetConfig | null | undefined): Promise<void> {
    if (!config) {
      return Promise.resolve();
    }

    // apiKey is now a required field, validated by schema.required
    if (!config.apiKey) {
      throw new Error('MinerU apiKey is required');
    }
    return Promise.resolve();
  }

  /**
   * Create MinerU toolset instance
   * Note: config may be null/undefined during authorization phase
   * Modified to read from toolset.credentials (like @searchapi/@email)
   */
  async create(config: any): Promise<BuiltinToolset> {
    // Check if config is an IXpertToolset object with credentials property
    const toolset = (config && typeof config === 'object' && 'credentials' in config)
      ? (config as IXpertToolset)
      : null;
    
    // Priority: toolset.credentials > config (flat structure) > empty object
    const creds: any = toolset?.credentials ?? config ?? {};
    
    // Build config with dependencies
    const configWithDependencies: MinerUToolsetConfig = {
      apiUrl: creds.apiUrl,
      apiKey: creds.apiKey,
      isOcr: creds.isOcr,
      enableFormula: creds.enableFormula,
      enableTable: creds.enableTable,
      language: creds.language,
      modelVersion: creds.modelVersion,
      configService: this.configService,
      resultParser: this.resultParser,
    };
    
    return new MinerUToolset(configWithDependencies);
  }

  /**
   * Create tools for MinerU toolset
   * Tools are created dynamically in MinerUToolset.initTools()
   * based on the toolset credentials/configuration
   */
  createTools() {
    /**
     * IMPORTANT:
     * The console UI requires builtin providers to expose at least one tool so users can
     * enable it (otherwise it fails the "Enable at least one tool" validation).
     *
     * The returned tools here are used for listing/preview & toggling in UI. Actual execution
     * will use the toolset instance created by `create()` -> `MinerUToolset.initTools()`,
     * which wires credentials (apiUrl/apiKey/serverType) correctly.
     */
    return [
      buildMinerUTool(
        this.configService,
        this.resultParser,
        // No credentials at listing time
        undefined,
        undefined,
        // Defaults used if user doesn't pass tool-call parameters
        {
          isOcr: true,
          enableFormula: true,
          enableTable: true,
          language: 'ch',
          modelVersion: 'pipeline',
        }
      ),
    ];
  }
}

