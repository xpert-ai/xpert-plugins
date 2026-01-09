import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { MinerUToolset, MinerUToolsetConfig } from './mineru.toolset.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { MinerUIntegrationOptions } from './types.js';

describe('MinerUToolset', () => {
  let configService: ConfigService;
  let resultParser: MinerUResultParserService;
  let config: MinerUToolsetConfig;

  beforeEach(() => {
    configService = new ConfigService();
    resultParser = new MinerUResultParserService();
    config = {
      apiUrl: process.env.MINERU_API_BASE_URL || 'https://mineru.net/api/v4',
      apiKey: process.env.MINERU_API_TOKEN || 'test-key',
      configService,
      resultParser,
    };
  });

  it('should create toolset instance', () => {
    const toolset = new MinerUToolset(config);
    expect(toolset).toBeDefined();
  });

  it('should validate credentials successfully', async () => {
    const toolset = new MinerUToolset(config);
    await expect(toolset._validateCredentials(config)).resolves.toBeUndefined();
  });

  it('should throw error when configService is missing during initTools', async () => {
    const toolset = new MinerUToolset({ ...config, configService: undefined });
    await expect(toolset.initTools()).rejects.toThrow('ConfigService and MinerUResultParserService are required');
  });

  it('should throw error when resultParser is missing during initTools', async () => {
    const toolset = new MinerUToolset({ ...config, resultParser: undefined });
    await expect(toolset.initTools()).rejects.toThrow('ConfigService and MinerUResultParserService are required');
  });

  it('should initialize tools', async () => {
    const toolset = new MinerUToolset(config);
    const tools = await toolset.initTools();
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('mineru_pdf_parser');
  });

  it('should use default apiUrl when not provided', async () => {
    const configWithoutUrl: MinerUToolsetConfig = {
      ...config,
      apiUrl: undefined,
    };
    const toolset = new MinerUToolset(configWithoutUrl);
    const tools = await toolset.initTools();
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
  });

  it('should convert string enum values to boolean', async () => {
    const configWithStringEnums: MinerUToolsetConfig = {
      ...config,
      isOcr: 'true',
      enableFormula: 'false',
      enableTable: 'true',
    };
    const toolset = new MinerUToolset(configWithStringEnums);
    const tools = await toolset.initTools();
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
  });

  it('should handle boolean values', async () => {
    const configWithBooleans: MinerUToolsetConfig = {
      ...config,
      isOcr: true,
      enableFormula: false,
      enableTable: true,
    };
    const toolset = new MinerUToolset(configWithBooleans);
    const tools = await toolset.initTools();
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
  });

  it('should pass all configuration options to tool', async () => {
    const fullConfig: MinerUToolsetConfig = {
      ...config,
      isOcr: 'true',
      enableFormula: 'false',
      enableTable: 'true',
      language: 'en',
      modelVersion: 'vlm',
    };
    const toolset = new MinerUToolset(fullConfig);
    const tools = await toolset.initTools();
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
    
    // Verify tool schema only contains doc_url
    const tool = tools[0];
    const schemaShape = (tool as any).schema?.shape || {};
    const schemaKeys = Object.keys(schemaShape);
    expect(schemaKeys).toContain('doc_url');
    expect(schemaKeys.length).toBe(1);
  });
});

