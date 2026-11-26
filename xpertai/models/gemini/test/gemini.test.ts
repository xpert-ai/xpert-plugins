import { config } from 'dotenv';
import { GeminiProviderStrategy } from '../src/provider.strategy.js';
import { GeminiModelCredentials } from '../src/types.js';
import { ICopilotModel } from '@xpert-ai/contracts';
import { GeminiLargeLanguageModel } from '../src/llm/llm.js';

config();

const apiKey = process.env.GOOGLE_API_KEY;
const integration = apiKey ? describe : describe.skip;

integration('Gemini Integration Test', () => {
  let provider: GeminiProviderStrategy;
  let llm: GeminiLargeLanguageModel;

  beforeAll(() => {
    provider = new GeminiProviderStrategy();
    llm = new GeminiLargeLanguageModel(provider);
  });

  it(
    'should validate credentials',
    async () => {
      const credentials: GeminiModelCredentials = {
        google_api_key: apiKey!,
      };

      await expect(
        llm.validateCredentials('gemini-flash-lite-latest', credentials)
      ).resolves.not.toThrow();
    },
    10 * 1000
  );

  it('should chat with the model', async () => {
    const credentials: GeminiModelCredentials = {
      google_api_key: apiKey!,
    };

    const copilotModel: ICopilotModel = {
      model: 'gemini-flash-lite-latest',
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
