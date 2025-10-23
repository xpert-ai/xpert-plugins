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
import { DifyService } from './dify.service.js';
import { Dify, DifyIcon, TDifyIntegrationOptions } from './types.js';

@Injectable()
@IntegrationStrategyKey(Dify)
export class DifyIntegrationStrategy implements IntegrationStrategy<TDifyIntegrationOptions> {
  meta: TIntegrationProvider = {
    name: Dify,
    label: {
      en_US: 'Dify',
      zh_Hans: 'Dify',
    },
    description: {
      en_US:
        'Dify’s Knowledge feature visualizes each stage of the RAG pipeline, developers can upload internal company documents, FAQs, and standard working guides, then process them into structured data that large language models (LLMs) can query.',
      zh_Hans:
        'Dify 的知识功能将 RAG 管道的每个阶段可视化，开发人员可以上传公司内部文档、常见问题解答和标准工作指南，然后将它们处理成大型语言模型 (LLM) 可以查询的结构化数据。',
    },
    icon: {
      type: 'svg',
      value: DifyIcon
    },
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          title: {
            en_US: 'Base URL',
            zh_Hans: '基础 URL',
          },
          description: {
            en_US: 'The base URL of the Dify server',
            zh_Hans: 'Dify 服务器的基础 URL',
          },
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key',
            zh_Hans: 'API 密钥',
          },
          description: {
            en_US: 'The API Key of the Dify server',
            zh_Hans: 'Dify 服务器的 API 密钥',
          },
        },
      },
    },
    features: [IntegrationFeatureEnum.KNOWLEDGE],
    helpUrl: 'https://docs.dify.ai/en/guides/knowledge-base/readme',
  };

  @Inject(DifyService)
  private readonly service: DifyService;

  execute(
    integration: IIntegration,
    payload: TIntegrationStrategyParams
  ): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async validateConfig(options: TDifyIntegrationOptions) {
    await this.service.test(options);
  }
}
