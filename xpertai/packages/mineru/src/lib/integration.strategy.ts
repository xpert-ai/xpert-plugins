import {
  IIntegration,
  IntegrationEnum,
  TIntegrationProvider,
} from '@metad/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
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
      properties: {
        apiUrl: {
          type: 'string',
          title: {
            en_US: 'Base URL',
          },
          description: {
            en_US: 'https://api.mineru.dev',
          },
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key',
          },
          description: {
            en_US: 'The API Key of the MinerU server',
          },
          'x-ui': <ISchemaSecretField>{
            component: 'secretInput',
            label: 'API Key',
            placeholder: '请输入您的 MinerU API Key',
            revealable: true,
            maskSymbol: '*',
            persist: true,
          },
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
      provider: MinerU as IntegrationEnum,
      options: config,
    });

    const result = await mineruClient.createTask({
      url: 'https://mineru.net/apiManage/docs',
    });
  }
}
