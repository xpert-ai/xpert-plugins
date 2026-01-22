import { type IIntegration, TIntegrationProvider } from '@metad/contracts';
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
import { icon, MinerUIntegration, MinerUIntegrationOptions } from './types.js';

@Injectable()
@IntegrationStrategyKey(MinerUIntegration)
export class MinerUIntegrationStrategy
  implements IntegrationStrategy<MinerUIntegrationOptions>
{
  readonly meta: TIntegrationProvider = {
    name: MinerUIntegration,
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
      properties: {
        apiUrl: {
          type: 'string',
          title: {
            en_US: 'Base URL',
          },
          description: {
            en_US: 'https://mineru.net/api/v4',
            ja_JP: 'MinerUサーバのBase URLを入力してください',
            zh_Hans: '请输入你的 MinerU 服务的 Base URL',
          },
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key',
          },
          description: {
            en_US: 'The API Key of the MinerU server',
            ja_JP: 'MinerUサーバのトークンを入力してください',
            zh_Hans: '请输入你的 MinerU 服务的令牌',
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
        serverType: {
          type: 'string',
          title: {
            en_US: 'Server Type',
            ja_JP: 'サーバータイプ',
            zh_Hans: '服务类型',
          },
          description: {
            en_US:
              'Please select MinerU service type, local deployment or official API',
            ja_JP:
              'MinerUサービスのタイプを選択してください、ローカルデプロイまたは公式API',
            zh_Hans: '请选择MinerU服务类型,本地部署或官方API',
          },
          enum: ['official', 'self-hosted'],
          default: 'official',
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
  ): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async validateConfig(config: MinerUIntegrationOptions): Promise<void> {
    const mineruClient = new MinerUClient(this.configService, {
      integration: {
        provider: MinerUIntegration,
        options: config,
      },
    });

    if (mineruClient.serverType === 'official') {
      try {
        await mineruClient.validateOfficialApiToken();
      } catch (error) {
        console.error(`MinerU integration validation error:`);
        console.error(error);
        throw error;
      }
    } else {
      // Self-hosted MinerU validation logic: access openapi.json
      try {
        await mineruClient.getSelfHostedOpenApiSpec();
      } catch (error) {
        console.error(`MinerU self-hosted integration validation error:`);
        console.error(error);
        throw error;
      }
    }
  }
}
