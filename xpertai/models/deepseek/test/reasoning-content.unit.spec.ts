import { describe, expect, it } from '@jest/globals';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { DeepSeekChatOAICompatReasoningModel } from '../src/llm/llm.js';

type PatchedDeepSeekModel = DeepSeekChatOAICompatReasoningModel & {
  completionWithRetry: (...args: unknown[]) => unknown;
  _generate: (...args: unknown[]) => Promise<{
    generations: Array<{
      text: string;
      message: AIMessage;
    }>;
  }>;
  _getEstimatedTokenCountFromPrompt: (...args: unknown[]) => Promise<number>;
  _getNumTokensFromGenerations: (...args: unknown[]) => Promise<number>;
};

const toolCallId = 'call_1';
const toolCall = {
  id: toolCallId,
  name: 'calculator',
  args: { left: 2, right: 2 },
  type: 'tool_call' as const,
};

function createModel(streaming: boolean) {
  return new DeepSeekChatOAICompatReasoningModel({
    model: 'deepseek-reasoner',
    apiKey: 'test-key',
    configuration: {
      baseURL: 'https://api.deepseek.com/v1',
    },
    streaming,
    temperature: 0,
    maxTokens: 128,
  }) as PatchedDeepSeekModel;
}

function buildToolMessages(reasoningContent = 'thought-1') {
  return [
    new HumanMessage('Use the calculator tool to add 2 and 2.'),
    new AIMessage({
      content: '',
      tool_calls: [toolCall],
      additional_kwargs: {
        reasoning_content: reasoningContent,
      },
    }),
    new ToolMessage({
      content: '4',
      tool_call_id: toolCallId,
      name: 'calculator',
    }),
  ];
}

describe('DeepSeek reasoning_content regressions', () => {
  it('forwards reasoning_content for assistant tool-call history', async () => {
    const model = createModel(false);
    let capturedRequest: Record<string, unknown> | undefined;

    model.completionWithRetry = async (...args: unknown[]) => {
      capturedRequest = args[0] as Record<string, unknown>;
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'The result is 4.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      };
    };

    await model.invoke(buildToolMessages());

    const requestMessages = capturedRequest?.messages as Array<Record<string, unknown>>;
    expect(requestMessages[1]?.role).toBe('assistant');
    expect(requestMessages[1]?.reasoning_content).toBe('thought-1');
    expect(requestMessages[1]?.tool_calls).toHaveLength(1);
  });

  it('preserves streamed reasoning_content for the next turn', async () => {
    const model = createModel(true);

    model.completionWithRetry = async () =>
      (async function* () {
        yield {
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                reasoning_content: 'thought-',
              },
            },
          ],
        };
        yield {
          choices: [
            {
              index: 0,
              delta: {
                reasoning_content: 'continued',
              },
            },
          ],
        };
        yield {
          choices: [
            {
              index: 0,
              delta: {
                content: 'final answer',
              },
              finish_reason: 'stop',
            },
          ],
          model: 'deepseek-reasoner',
        };
      })();
    model._getEstimatedTokenCountFromPrompt = async () => 0;
    model._getNumTokensFromGenerations = async () => 0;

    const result = await model._generate([new HumanMessage('Hi')]);

    expect(result.generations[0]?.text).toBe('final answer');
    expect(result.generations[0]?.message.additional_kwargs?.reasoning_content).toBe(
      'thought-continued'
    );
  });

  it('emits terminal message content as a stream chunk when the last delta has no text', async () => {
    const model = createModel(true);

    model.completionWithRetry = async () =>
      (async function* () {
        yield {
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                reasoning_content: 'thought-',
              },
            },
          ],
        };
        yield {
          choices: [
            {
              index: 0,
              delta: {
                reasoning_content: 'continued',
              },
            },
          ],
        };
        yield {
          choices: [
            {
              index: 0,
              delta: {},
              message: {
                role: 'assistant',
                content: 'final answer',
              },
              finish_reason: 'stop',
            },
          ],
          model: 'deepseek-reasoner',
        };
      })();

    const chunks: string[] = [];
    for await (const chunk of model._streamResponseChunks([new HumanMessage('Hi')])) {
      chunks.push(chunk.text);
    }

    expect(chunks).toContain('final answer');
  });
});
