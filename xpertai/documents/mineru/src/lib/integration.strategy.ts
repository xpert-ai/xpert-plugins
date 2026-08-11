import { type IIntegration, TIntegrationProvider } from '@xpert-ai/contracts';
import {
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationStrategy,
  IntegrationStrategyKey,
  ISchemaSecretField,
  TIntegrationStrategyParams,
} from '@xpert-ai/plugin-sdk';
import { MinerUClient } from './mineru.client.js';
import { icon, MinerU, MinerUIntegrationOptions } from './types.js';

@Injectable()
@IntegrationStrategyKey(MinerU)
export class MinerUIntegrationStrategy
  implements IntegrationStrategy<MinerUIntegrationOptions>
{
  readonly meta: TIntegrationProvider = {
    name: MinerU,
    label: {
      en_US: 'MinerU',
    },
    description: {
      en_US:
        'MinerU is a tool that converts PDFs into machine-readable formats (e.g., markdown, JSON), allowing for easy extraction into any format. ',
      zh_Hans:
        'MinerU 是一种将 PDF 转换为机器可读格式（例如 markdown、JSON）的工具，可以轻松提取为任何格式。',
    },
    icon: {
      type: 'svg',
      value: icon,
      color: '#4CAF50',
    },
    schema: {
      type: 'object',
      secret: ['apiKey'],
      properties: {
        serverType: {
          type: 'string',
          title: {
            en_US: 'Service Type',
            zh_Hans: '服务类型',
          },
          description: {
            en_US: 'Use MinerU Precise Parsing API or a self-hosted mineru-api/mineru-router service.',
            zh_Hans: '使用 MinerU 精准解析 API，或自托管的 mineru-api/mineru-router 服务。',
          },
          enum: ['official', 'self-hosted'],
          default: 'official',
          'x-ui': {
            enumLabels: {
              official: { en_US: 'Official API', zh_Hans: '官方 API' },
              'self-hosted': { en_US: 'Self-hosted', zh_Hans: '自托管' },
            },
          },
        },
        apiUrl: {
          type: 'string',
          title: {
            en_US: 'Base URL',
            zh_Hans: '服务地址',
          },
          description: {
            en_US: 'Official default: https://mineru.net/api/v4. For self-hosted mode, enter mineru-api or mineru-router base URL.',
            ja_JP: 'MinerUサーバのBase URLを入力してください',
            zh_Hans: '官方默认 https://mineru.net/api/v4；自托管模式请输入 mineru-api 或 mineru-router 的服务地址。',
          },
          'x-ui': { component: 'textInput' },
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'Access Token',
            zh_Hans: '访问令牌',
          },
          description: {
            en_US: 'Required by the official Precise Parsing API; optional for an authenticated self-hosted gateway.',
            ja_JP: 'MinerUサーバのトークンを入力してください',
            zh_Hans: '官方精准解析 API 必填；自托管网关启用鉴权时可填写。',
          },
          'x-ui': <ISchemaSecretField>{
            component: 'secretInput',
            label: 'Access Token',
            placeholder: 'MinerU Access Token',
            revealable: true,
            maskSymbol: '*',
            persist: true,
          },
        },
        uploadMode: {
          type: 'string',
          title: {
            en_US: 'Source Mode',
            zh_Hans: '文件提交方式',
          },
          description: {
            en_US: 'Auto uploads workspace files through MinerU signed URLs and only falls back to a public URL when no local file is available.',
            zh_Hans: '自动模式优先通过 MinerU 预签名地址上传知识库文件，仅在没有本地文件时回退到公开 URL。',
          },
          enum: ['auto', 'file', 'url'],
          default: 'auto',
          'x-ui': {
            enumLabels: {
              auto: { en_US: 'Auto', zh_Hans: '自动' },
              file: { en_US: 'File Upload', zh_Hans: '文件上传' },
              url: { en_US: 'Public URL', zh_Hans: '公开 URL' },
            },
            visibleWhen: { name: 'serverType', value: 'official' },
          },
        },
        pollIntervalSeconds: {
          type: 'number',
          title: { en_US: 'Polling Interval (seconds)', zh_Hans: '轮询间隔（秒）' },
          default: 5,
          'x-ui': { component: 'numberInput', visibleWhen: { name: 'serverType', value: 'official' } },
        },
        taskTimeoutSeconds: {
          type: 'number',
          title: { en_US: 'Task Timeout (seconds)', zh_Hans: '任务超时（秒）' },
          default: 1800,
          'x-ui': { component: 'numberInput' },
        },
        requestTimeoutSeconds: {
          type: 'number',
          title: { en_US: 'Request Timeout (seconds)', zh_Hans: '单次请求超时（秒）' },
          default: 1200,
          'x-ui': { component: 'numberInput' },
        },
      },
    },
    features: [],
    helpUrl: 'https://mineru.net/apiManage/docs',
  };

  @Inject(forwardRef(() => ConfigService))
  private readonly configService: ConfigService;

  async execute(
    integration: IIntegration<MinerUIntegrationOptions>,
    payload: TIntegrationStrategyParams
  ): Promise<never> {
    void integration;
    void payload;
    throw new Error('MinerU integration does not expose executable actions');
  }

  async validateConfig(config: MinerUIntegrationOptions): Promise<void> {
    const mineruClient = new MinerUClient(this.configService, {
      integration: {
        provider: MinerU,
        options: config,
      },
    });

    if (mineruClient.serverType === 'official') {
      await mineruClient.validateOfficialApiToken();
    } else {
      await mineruClient.validateSelfHostedService();
    }
  }
}
