import { config } from 'dotenv';
import { TongyiProviderStrategy } from '../src/provider.strategy.js';
import { TongyiCredentials } from '../src/types.js';
import { ICopilotModel } from '@metad/contracts';
import { TongyiLargeLanguageModel } from '../src/llm/llm.js';

config();

describe('Tongyi Integration Test', () => {
  let provider: TongyiProviderStrategy;
  let llm: TongyiLargeLanguageModel;
  const apiKey = process.env.DASHSCOPE_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      console.warn(
        'Skipping Tongyi integration tests: DASHSCOPE_API_KEY not found in environment'
      );
    }
    provider = new TongyiProviderStrategy();
    llm = new TongyiLargeLanguageModel(provider);
  });

  it(
    'should validate credentials',
    async () => {
      if (!apiKey) return;

      const credentials: TongyiCredentials = {
        dashscope_api_key: apiKey,
      };

      await expect(
        llm.validateCredentials('qwen-turbo', credentials)
      ).resolves.not.toThrow();
    },
    10 * 1000
  );

  it('should chat with the model', async () => {
    if (!apiKey) return;

    const credentials: TongyiCredentials = {
      dashscope_api_key: apiKey,
    };

    const copilotModel: ICopilotModel = {
      model: 'qwen-turbo',
      copilot: {
        modelProvider: {
          credentials,
        },
      },
    } as any;

    const chatModel = llm.getChatModel(copilotModel, {
      modelProperties: {},
    } as any);

    const response = await chatModel.invoke('你好，请用中文简单介绍一下你自己');
    console.log('Tongyi Response:', response.content);
    expect(response.content).toBeTruthy();
  }, 30 * 1000);

  it('should chat with qwen-plus model', async () => {
    if (!apiKey) return;

    const credentials: TongyiCredentials = {
      dashscope_api_key: apiKey,
    };

    const copilotModel: ICopilotModel = {
      model: 'qwen-plus',
      copilot: {
        modelProvider: {
          credentials,
        },
      },
    } as any;

    const chatModel = llm.getChatModel(copilotModel, {
      modelProperties: {},
    } as any);

    const response = await chatModel.invoke('What is 2 + 2?');
    console.log('Tongyi qwen-plus Response:', response.content);
    expect(response.content).toBeTruthy();
  }, 30 * 1000);
});

