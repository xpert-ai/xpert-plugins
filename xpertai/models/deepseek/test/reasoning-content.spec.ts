import { describe, it, expect, beforeAll } from '@jest/globals';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DeepSeekChatOAICompatReasoningModel } from '../src/llm/llm.js';

const toolCallId = 'call_1';
const toolCall: { id: string; name: string; args: Record<string, unknown>; type?: 'tool_call' } = {
  id: toolCallId,
  name: 'calculator',
  args: { left: 2, right: 2 },
  type: 'tool_call',
};

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

function buildMessages(includeReasoning: boolean) {
  return [
    new HumanMessage('Use the calculator tool to add 2 and 2.'),
    new AIMessage({
      content: '',
      tool_calls: [toolCall],
      additional_kwargs: includeReasoning ? { reasoning_content: 'thought-1' } : {},
    }),
    new ToolMessage({
      content: '4',
      tool_call_id: toolCallId,
      name: 'calculator',
    }),
  ];
}

describe('DeepSeek reasoning tool calls', () => {
  let model: DeepSeekChatOAICompatReasoningModel | null = null;
  let shouldSkip = false;

  beforeAll(() => {
    if (!validateConfig()) {
      console.warn('Skipping DeepSeek reasoning tool call tests: missing DEEPSEEK_API_KEY');
      shouldSkip = true;
      return;
    }

    model = new DeepSeekChatOAICompatReasoningModel({
      model: 'deepseek-reasoner',
      apiKey: testConfig.apiKey,
      configuration: {
        baseURL: testConfig.baseURL,
      },
      streaming: false,
      temperature: 0,
      maxTokens: 128,
    });
  });

  it('throws when reasoning_content is missing after tool calls', async () => {
    if (shouldSkip || !model) {
      return;
    }

    await expect(model.invoke(buildMessages(false))).rejects.toThrow(/reasoning_content/i);
  }, testConfig.timeout);

  it('succeeds when reasoning_content is provided after tool calls', async () => {
    if (shouldSkip || !model) {
      return;
    }

    const response = await model.invoke(buildMessages(true));
    expect(response.content).toBeTruthy();
  }, testConfig.timeout);
});
