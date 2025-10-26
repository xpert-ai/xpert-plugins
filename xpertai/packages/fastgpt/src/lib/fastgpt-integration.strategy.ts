import {
  IIntegration,
  IntegrationFeatureEnum,
  TIntegrationProvider,
} from '@metad/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  IntegrationStrategy,
  IntegrationStrategyKey,
  TIntegrationStrategyParams,
} from '@xpert-ai/plugin-sdk';
import { FastGPT, SvgIcon, TFastGPTIntegrationConfig } from './types.js';
import { FastGPTService } from './fastgpt.service.js';

@Injectable()
@IntegrationStrategyKey(FastGPT)
export class FastGPTIntegrationStrategy
  implements IntegrationStrategy<TFastGPTIntegrationConfig>
{
  meta: TIntegrationProvider = {
    name: FastGPT,
    label: {
      en_US: 'FastGPT',
      zh_Hans: 'FastGPT',
    },
    description: {
      en_US:
        'FastGPT is a knowledge base Q&A system based on LLM large language models.',
      zh_Hans: 'FastGPT 是一个基于 LLM 大语言模型的知识库问答系统。',
    },
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The url of FastGPT server',
        },
        apiKey: {
          type: 'string',
          description: 'The API Key of the FastGPT server',
        },
      },
    },
    features: [IntegrationFeatureEnum.KNOWLEDGE],
    helpUrl:
      'https://doc.fastgpt.io/docs/introduction/development/openapi/dataset',
  };

  @Inject(FastGPTService)
  private readonly service: FastGPTService

  execute(
    integration: IIntegration,
    payload: TIntegrationStrategyParams
  ): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async validateConfig?(config: TFastGPTIntegrationConfig): Promise<void> {
    await this.service.test({options: config} as IIntegration);
  }
}
