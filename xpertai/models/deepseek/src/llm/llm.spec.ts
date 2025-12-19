import { ICopilotModel } from '@metad/contracts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { DeepSeekLargeLanguageModel } from './llm.js';
import { DeepSeekProviderStrategy } from '../provider.strategy.js';

describe('DeepSeekLargeLanguageModel', () => {
  it('includes reasoning_content when forwarding assistant messages', async () => {
    const provider = new DeepSeekProviderStrategy();
    (provider as any).credentials = {
      api_key: 'test-key',
      endpoint_url: 'https://api.deepseek.com',
    };

    const llm = new DeepSeekLargeLanguageModel(provider);

    const copilotModel = {
      model: 'deepseek-reasoner',
      copilot: {
        modelProvider: provider,
      },
      options: {
        streaming: false,
      },
    } as unknown as ICopilotModel;

    const chatModel: any = llm.getChatModel(copilotModel);
    const completionSpy = jest.spyOn(chatModel as any, 'completionWithRetry').mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    });

    await chatModel.invoke([
      new HumanMessage('hello'),
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'do_something',
              arguments: '{}',
            },
          },
        ],
        additional_kwargs: {
          reasoning_content: 'thinking in progress',
        },
      }),
    ]);

    const request = completionSpy.mock.calls[0][0];
    expect(request.messages[1].reasoning_content).toBe('thinking in progress');
  });
});
