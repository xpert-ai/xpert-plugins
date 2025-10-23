import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { MinerUIntegrationStrategy } from './integration.strategy.js';
import {
  ENV_MINERU_API_BASE_URL,
  ENV_MINERU_API_TOKEN,
  MinerUIntegrationOptions,
} from './types.js';

describe('MinerUIntegrationStrategy', () => {
  let strategy: MinerUIntegrationStrategy;
  let configService: ConfigService;
  let minerUOptions = null as MinerUIntegrationOptions;

  beforeEach(() => {
    configService = new ConfigService();
    strategy = new MinerUIntegrationStrategy();
    // @ts-ignore
    strategy.configService = configService;
    minerUOptions = {
      apiUrl: process.env[ENV_MINERU_API_BASE_URL],
      apiKey: process.env[ENV_MINERU_API_TOKEN] || 'your-api-key',
    };
  });

  it('should have correct meta information', () => {
    expect(strategy.meta.name).toBeDefined();
    expect(strategy.meta.label.en_US).toBe('MinerU');
    expect(strategy.meta.icon.type).toBe('svg');
    expect(strategy.meta.schema).toBeDefined();
    expect(strategy.meta.helpUrl).toBe('https://mineru.net/apiManage/docs');
  });

  it('should throw error for unimplemented execute', async () => {
    await expect(strategy.execute({} as any, {} as any)).rejects.toThrow(
      'Method not implemented.'
    );
  });

  it('should validate config successfully', async () => {
    await expect(
      strategy.validateConfig(minerUOptions)
    ).resolves.toBeUndefined();
  });
});
