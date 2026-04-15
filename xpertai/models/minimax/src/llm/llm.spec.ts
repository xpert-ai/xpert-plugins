import { HumanMessage } from '@langchain/core/messages';
import { ICopilotModel } from '@metad/contracts';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxLargeLanguageModel } from './llm.js';

type PatchedChatModel = ReturnType<MiniMaxLargeLanguageModel['getChatModel']> & {
  completionWithRetry: (...args: unknown[]) => unknown;
  invocationParams: (...args: unknown[]) => Record<string, unknown>;
  _generate: (...args: unknown[]) => Promise<{
    generations: Array<{
      text: string;
      message: {
        content: string;
        additional_kwargs?: Record<string, unknown>;
      };
    }>;
  }>;
  _getEstimatedTokenCountFromPrompt: (...args: unknown[]) => Promise<number>;
  _getNumTokensFromGenerations: (...args: unknown[]) => Promise<number>;
};

function createCopilotModel(
  model: string,
  options: Record<string, unknown>,
  credentials: Record<string, unknown> = {
    api_key: 'test-key',
    group_id: 'test-group'
  }
): ICopilotModel {
  return {
    model,
    options,
    copilot: {
      modelProvider: {
        credentials
      }
    }
  } as unknown as ICopilotModel;
}

describe('MiniMaxLargeLanguageModel', () => {
  let provider: MiniMaxProviderStrategy;
  let llm: MiniMaxLargeLanguageModel;

  beforeEach(() => {
    provider = new MiniMaxProviderStrategy();
    llm = new MiniMaxLargeLanguageModel(provider);
  });

  it('enables reasoning_split for MiniMax chat requests', () => {
    const model = llm.getChatModel(
      createCopilotModel('MiniMax-M2.7-highspeed', {
        streaming: true,
        max_tokens: 256
      })
    ) as PatchedChatModel;

    const params = model.invocationParams();

    expect(params.reasoning_split).toBe(true);
  });

  it('maps reasoning_details into reasoning_content for non-streaming responses', async () => {
    const model = llm.getChatModel(
      createCopilotModel('MiniMax-M2.7-highspeed', {
        streaming: false,
        max_tokens: 256
      })
    ) as PatchedChatModel;

    const reasoningDetails = [
      {
        id: 'reasoning-text-1',
        type: 'reasoning.text',
        text: '内部思考'
      }
    ];

    model.completionWithRetry = async () => ({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '最终回答',
            reasoning_details: reasoningDetails
          },
          finish_reason: 'stop'
        }
      ],
      usage: {}
    });

    const result = await model._generate([new HumanMessage('你好')]);

    expect(result.generations[0]?.text).toBe('最终回答');
    expect(result.generations[0]?.message.content).toBe('最终回答');
    expect(result.generations[0]?.message.additional_kwargs?.reasoning_content).toBe('内部思考');
    expect(result.generations[0]?.message.additional_kwargs?.reasoning_details).toEqual(reasoningDetails);
  });

  it('accumulates streamed reasoning_details without leaking them into content', async () => {
    const model = llm.getChatModel(
      createCopilotModel('MiniMax-M2.7-highspeed', {
        streaming: true,
        max_tokens: 256
      })
    ) as PatchedChatModel;

    const finalReasoningDetails = [
      {
        id: 'reasoning-text-1',
        type: 'reasoning.text',
        text: '先分析，再收束'
      }
    ];

    model.completionWithRetry = async () =>
      (async function* () {
        yield {
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                reasoning_details: [
                  {
                    id: 'reasoning-text-1',
                    type: 'reasoning.text',
                    text: '先分析'
                  }
                ]
              }
            }
          ]
        };

        yield {
          choices: [
            {
              index: 0,
              delta: {
                reasoning_details: finalReasoningDetails
              }
            }
          ]
        };

        yield {
          choices: [
            {
              index: 0,
              delta: {
                content: '最终回答'
              },
              finish_reason: 'stop'
            }
          ],
          model: 'MiniMax-M2.7-highspeed'
        };
      })();

    model._getEstimatedTokenCountFromPrompt = async () => 0;
    model._getNumTokensFromGenerations = async () => 0;

    const result = await model._generate([new HumanMessage('你好')]);

    expect(result.generations[0]?.text).toBe('最终回答');
    expect(result.generations[0]?.message.content).toBe('最终回答');
    expect(result.generations[0]?.message.additional_kwargs?.reasoning_content).toBe('先分析，再收束');
    expect(result.generations[0]?.message.additional_kwargs?.reasoning_details).toEqual(
      finalReasoningDetails
    );
  });

  it('falls back to extracting mixed think tags when reasoning_split is absent', async () => {
    const model = llm.getChatModel(
      createCopilotModel('MiniMax-M2.7-highspeed', {
        streaming: true,
        max_tokens: 256
      })
    ) as PatchedChatModel;

    model.completionWithRetry = async () =>
      (async function* () {
        yield {
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: '<think>先分析'
              }
            }
          ]
        };

        yield {
          choices: [
            {
              index: 0,
              delta: {
                content: '，再收束</think>最终回答'
              },
              finish_reason: 'stop'
            }
          ],
          model: 'MiniMax-M2.7-highspeed'
        };
      })();

    model._getEstimatedTokenCountFromPrompt = async () => 0;
    model._getNumTokensFromGenerations = async () => 0;

    const result = await model._generate([new HumanMessage('你好')]);

    expect(result.generations[0]?.text).toBe('最终回答');
    expect(result.generations[0]?.message.content).toBe('最终回答');
    expect(result.generations[0]?.message.additional_kwargs?.reasoning_content).toBe('先分析，再收束');
  });
});
