import { getDeepSeekCacheReadTokens } from '../src/llm/llm.js';

describe('getDeepSeekCacheReadTokens', () => {
  it('reads the official DeepSeek cache hit field', () => {
    expect(getDeepSeekCacheReadTokens({ prompt_cache_hit_tokens: 123 })).toBe(123);
  });

  it('keeps the OpenAI-compatible cached token fallback', () => {
    expect(
      getDeepSeekCacheReadTokens({
        prompt_tokens_details: { cached_tokens: 45 },
      }),
    ).toBe(45);
  });

  it('prefers the provider-native field when both are present', () => {
    expect(
      getDeepSeekCacheReadTokens({
        prompt_cache_hit_tokens: 123,
        prompt_tokens_details: { cached_tokens: 45 },
      }),
    ).toBe(123);
  });
});
