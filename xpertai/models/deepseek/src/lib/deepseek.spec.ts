import { Test } from '@nestjs/testing';
import { DeepSeekProviderStrategy } from '../provider.strategy';
import { DeepSeekLargeLanguageModel } from '../llm/llm';

describe('DeepSeekProviderStrategy', () => {
  let provider: DeepSeekProviderStrategy;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DeepSeekProviderStrategy, DeepSeekLargeLanguageModel],
    }).compile();

    provider = module.get(DeepSeekProviderStrategy);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
