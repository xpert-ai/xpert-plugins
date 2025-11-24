import { config } from 'dotenv';
import { GeminiProviderStrategy } from '../src/provider.strategy.js';
import { GeminiModelCredentials } from '../src/types.js';
import { ICopilotModel } from '@metad/contracts';
import { GeminiLargeLanguageModel } from '../src/llm/llm.js';

config();

describe('Gemini Integration Test', () => {
  let provider: GeminiProviderStrategy;
  let llm: GeminiLargeLanguageModel;
  const apiKey = process.env.GOOGLE_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      console.warn(
        'Skipping Gemini integration tests: GOOGLE_API_KEY not found in environment'
      );
    }
    provider = new GeminiProviderStrategy();
    llm = new GeminiLargeLanguageModel(provider);
  });

  it(
    'should validate credentials',
    async () => {
      if (!apiKey) return;

      const credentials: GeminiModelCredentials = {
        google_api_key: apiKey,
      };

      await expect(
        llm.validateCredentials('gemini-2.5-flash', credentials)
      ).resolves.not.toThrow();
    },
    10 * 1000
  );

  it('should chat with the model', async () => {
    if (!apiKey) return;

    const credentials: GeminiModelCredentials = {
      google_api_key: apiKey,
    };

    const copilotModel: ICopilotModel = {
      model: 'gemini-2.5-flash',
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
    console.log('Gemini Response:', response.content);
    expect(response.content).toBeTruthy();
  });
});
