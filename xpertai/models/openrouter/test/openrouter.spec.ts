import { config } from 'dotenv';
import { OpenRouterProviderStrategy } from '../src/provider.strategy.js';
import { OpenRouterLargeLanguageModel } from '../src/llm/llm.js';
import { OpenRouterModelCredentials } from '../src/types.js';
import { ICopilotModel } from '@metad/contracts';

config();

describe('OpenRouter Integration Test', () => {
  let provider: OpenRouterProviderStrategy;
  let llm: OpenRouterLargeLanguageModel;
  const apiKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      console.warn(
        'Skipping OpenRouter integration tests: OPENROUTER_API_KEY not found in environment'
      );
    }
    provider = new OpenRouterProviderStrategy();
    llm = new OpenRouterLargeLanguageModel(provider);
  });

  it('should validate credentials', async () => {
    if (!apiKey) return;

    const credentials: OpenRouterModelCredentials = {
      api_key: apiKey,
    };

    // Use a free model for validation if possible
    await expect(
      llm.validateCredentials('tngtech/deepseek-r1t2-chimera:free', credentials)
    ).resolves.not.toThrow();
  }, 10000);

  it('should chat with the model', async () => {
    if (!apiKey) return;

    const credentials: OpenRouterModelCredentials = {
      api_key: apiKey,
    };

    const copilotModel: ICopilotModel = {
      model: 'google/gemma-3-4b-it:free',
      copilot: {
        modelProvider: {
          credentials,
        },
      },
    } as any;

    const chatModel = llm.getChatModel(copilotModel, {
      modelProperties: {},
    } as any);

    const response = await chatModel.invoke('Hello, how are you?');
    console.log('OpenRouter Response:', response.content);
    expect(response.content).toBeTruthy();
  }, 20000);
});
