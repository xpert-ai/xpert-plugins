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

interface IXpertToolset {
  credentials?: any;
  [key: string]: any;
}

@Injectable()
@ToolsetStrategy(MinerU)
export class MinerUToolsetStrategy implements IToolsetStrategy<MinerUToolsetConfig> {
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
        'Convert documents to markdown format using MinerU. Supports OCR, formula recognition, and table extraction.',
      zh_Hans: '使用 MinerU 将文档转换为 Markdown 格式。支持 OCR、公式识别和表格提取。',
    },
    icon: {
      type: 'svg',
      value: icon,
      svg: icon,
      color: '#14b8a6',
    },
    configSchema: {
      type: 'object',
      properties: {
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
        isOcr: {
          type: 'string',
          title: {
            en_US: 'Enable OCR',
            zh_Hans: '启用 OCR',
          },
          description: {
            en_US: 'Enable OCR for image-based documents',
            zh_Hans: '为基于图像的文档启用 OCR',
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
        returnJson: {
          type: 'string',
          title: {
            en_US: 'Return JSON',
            zh_Hans: '返回完整 JSON',
          },
          description: {
            en_US: 'Return full JSON payload instead of plain text.',
            zh_Hans: '返回完整 JSON 结构，而非纯文本。',
          },
          enum: ['true', 'false'],
          default: 'false',
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
        includeNonImageFiles: {
          type: 'string',
          title: {
            en_US: 'Include Non-Image Files',
            zh_Hans: '包含非图片文件',
          },
          description: {
            en_US: 'Include markdown and JSON files in tool file outputs.',
            zh_Hans: '在工具文件输出中包含 Markdown 与 JSON 文件。',
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
        extraFormats: {
          type: 'string',
          title: {
            en_US: 'Extra Formats',
            zh_Hans: '额外输出格式',
          },
          description: {
            en_US: 'Optional extra formats, comma-separated (docx, html, latex).',
            zh_Hans: '可选额外输出格式，逗号分隔（docx、html、latex）。',
          },
        },
      },
      required: ['apiKey'],
    },
  };

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

  validateConfig(config: MinerUToolsetConfig | null | undefined): Promise<void> {
    if (!config) {
      return Promise.resolve();
    }

    if (!config.apiKey) {
      throw new Error('MinerU apiKey is required');
    }
    return Promise.resolve();
  }

  async create(config: any): Promise<BuiltinToolset> {
    const toolset =
      config && typeof config === 'object' && 'credentials' in config
        ? (config as IXpertToolset)
        : null;

    const creds: any = toolset?.credentials ?? config ?? {};

    const configWithDependencies: MinerUToolsetConfig = {
      apiUrl: creds.apiUrl,
      apiKey: creds.apiKey,
      extraFormats: creds.extraFormats,
      isOcr: creds.isOcr,
      enableFormula: creds.enableFormula,
      enableTable: creds.enableTable,
      language: creds.language,
      modelVersion: creds.modelVersion,
      returnJson: creds.returnJson,
      includeNonImageFiles: creds.includeNonImageFiles,
      configService: this.configService,
      resultParser: this.resultParser,
    };

    return new MinerUToolset(configWithDependencies);
  }

  createTools() {
    return [
      buildMinerUTool(
        this.configService,
        this.resultParser,
        undefined,
        undefined,
        {
          isOcr: true,
          enableFormula: true,
          enableTable: true,
          language: 'ch',
          modelVersion: 'pipeline',
          returnJson: false,
          includeNonImageFiles: true,
        }
      ),
    ];
  }
}
