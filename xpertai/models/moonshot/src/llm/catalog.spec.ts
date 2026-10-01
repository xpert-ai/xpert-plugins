jest.mock('lodash-es', () => jest.requireActual('../../../../test-utils/lodashEsMock'));

import { MoonshotProviderStrategy } from '../provider.strategy.js';
import { MoonshotLargeLanguageModel } from './llm.js';

describe('Moonshot model catalog', () => {
  it('only exposes supported Kimi models after Moonshot V1 retirement', () => {
    const provider = new MoonshotProviderStrategy();
    const modelManager = new MoonshotLargeLanguageModel(provider);

    expect(modelManager.predefinedModels().map((model) => model.model).sort()).toEqual([
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k3',
    ]);
  });
});
