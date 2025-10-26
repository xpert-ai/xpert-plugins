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
import { RAGFlowService } from './ragflow.service.js';
import { RAGFlow, SvgIcon, TRAGFlowIntegrationConfig } from './types.js';

@Injectable()
@IntegrationStrategyKey(RAGFlow)
export class RAGFlowIntegrationStrategy
  implements IntegrationStrategy<TRAGFlowIntegrationConfig>
{
  meta: TIntegrationProvider = {
    name: RAGFlow,
    label: {
      en_US: 'RAGFlow',
      zh_Hans: 'RAGFlow',
    },
    description: {
      en_US:
        'RAGFlow is the leading open-source RAG engine, converging cutting-edge RAG with Agent capabilities to build the superior context layer for LLMs.',
      zh_Hans:
        'RAGFlow 是领先的开源 RAG 引擎，它将尖端的 RAG 与 Agent 功能融合，为 LLM 构建卓越的上下文层。',
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
          description: 'The url of RAGFlow server',
        },
        apiKey: {
          type: 'string',
          description: 'The API Key of the RAGFlow App',
        },
      },
    },
    features: [IntegrationFeatureEnum.KNOWLEDGE],
    helpUrl: 'https://ragflow.io/docs/dev/http_api_reference#retrieve-chunks',
  };

  @Inject(RAGFlowService)
  private readonly ragflowService: RAGFlowService;

  execute(
    integration: IIntegration,
    payload: TIntegrationStrategyParams
  ): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async validateConfig(config: TRAGFlowIntegrationConfig): Promise<void> {
    await this.ragflowService.test({
      provider: RAGFlow,
      options: config,
    } as IIntegration);
  }
}
