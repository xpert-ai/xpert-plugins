import { describe, it, expect, beforeAll } from '@jest/globals';
import { HumanMessage } from '@langchain/core/messages';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DeepSeekChatOAICompatReasoningModel } from '../src/llm/llm.js';

const testRootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: join(testRootDir, '.env') });

const testConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  timeout: parseInt(process.env.DEEPSEEK_TEST_TIMEOUT || '30000', 10),
};

function validateConfig(): boolean {
  if (!testConfig.apiKey) {
    console.error('❌ Error: Please set DEEPSEEK_API_KEY in xpertai/.env');
    return false;
  }
  return true;
}

function createModel(thinking?: boolean) {
  return new DeepSeekChatOAICompatReasoningModel({
    model: 'deepseek-chat',
    apiKey: testConfig.apiKey,
    configuration: {
      baseURL: testConfig.baseURL,
    },
    streaming: false,
    temperature: 0,
    maxTokens: 128,
    thinking,
  });
}

describe('DeepSeek thinking mode (real API)', () => {
  let shouldSkip = false;
  let modelThinking: DeepSeekChatOAICompatReasoningModel | null = null;
  let modelNoThinking: DeepSeekChatOAICompatReasoningModel | null = null;

  beforeAll(() => {
    if (!validateConfig()) {
      console.warn('Skipping DeepSeek thinking mode tests: missing DEEPSEEK_API_KEY');
      shouldSkip = true;
      return;
    }

    modelThinking = createModel(true);
    modelNoThinking = createModel(false);
  });

  it('returns reasoning_content when thinking enabled', async () => {
    if (shouldSkip || !modelThinking) {
      return;
    }

    const response = await modelThinking.invoke([
      new HumanMessage('Explain 2+2 step by step, then provide the final answer.'),
    ]);
    const reasoning = (response as { additional_kwargs?: { reasoning_content?: unknown } })
      .additional_kwargs?.reasoning_content;

    expect(reasoning).toBeTruthy();
  }, testConfig.timeout);

  it('omits reasoning_content when thinking disabled', async () => {
    if (shouldSkip || !modelNoThinking) {
      return;
    }

    const response = await modelNoThinking.invoke([
      new HumanMessage('Explain 2+2 step by step, then provide the final answer.'),
    ]);
    const reasoning = (response as { additional_kwargs?: { reasoning_content?: unknown } })
      .additional_kwargs?.reasoning_content;

    expect(reasoning).toBeUndefined();
  }, testConfig.timeout);
});
