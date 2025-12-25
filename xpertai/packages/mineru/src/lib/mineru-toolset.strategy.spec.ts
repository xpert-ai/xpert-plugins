import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { MinerUToolsetStrategy } from './mineru-toolset.strategy.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { MinerU } from './types.js';

describe('MinerUToolsetStrategy', () => {
  let strategy: MinerUToolsetStrategy;
  let configService: ConfigService;
  let resultParser: MinerUResultParserService;

  beforeEach(() => {
    configService = new ConfigService();
    resultParser = new MinerUResultParserService();
    strategy = new MinerUToolsetStrategy(configService, resultParser);
  });

  it('should have correct meta information', () => {
    expect(strategy.meta.name).toBe(MinerU);
    expect(strategy.meta.label.en_US).toBe('MinerU PDF Parser');
    expect(strategy.meta.label.zh_Hans).toBe('MinerU PDF 解析器');
    expect(strategy.meta.icon.svg).toBeDefined();
    expect(strategy.meta.tags).toContain('pdf');
    expect(strategy.meta.tags).toContain('mineru');
  });

  it('should have correct permissions', () => {
    expect(strategy.permissions).toHaveLength(1);
    expect(strategy.permissions[0].type).toBe('filesystem');
  });

  it('should validate config successfully with apiKey', async () => {
    const config = {
      apiUrl: 'https://mineru.net/api/v4',
      apiKey: 'test-key',
    };

    await expect(strategy.validateConfig(config)).resolves.toBeUndefined();
  });

  it('should throw error when apiKey is missing', async () => {
    const config = {
      apiUrl: 'https://mineru.net/api/v4',
    } as any;

    try {
      await strategy.validateConfig(config);
      fail('Expected validateConfig to throw an error');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('MinerU apiKey is required');
    }
  });

  it('should validate config with string enum values', async () => {
    const config = {
      apiUrl: 'https://mineru.net/api/v4',
      apiKey: 'test-key',
      isOcr: 'true',
      enableFormula: 'false',
      enableTable: 'true',
      language: 'ch' as const,
      modelVersion: 'pipeline' as const,
    };

    await expect(strategy.validateConfig(config)).resolves.toBeUndefined();
  });

  it('should create toolset instance', async () => {
    const config = {
      apiUrl: 'https://mineru.net/api/v4',
      apiKey: 'test-key',
    };

    const toolset = await strategy.create(config);
    expect(toolset).toBeDefined();
    expect(toolset.constructor.name).toBe('MinerUToolset');
  });

  it('should create toolset instance with all configuration options', async () => {
    const config = {
      apiUrl: 'https://mineru.net/api/v4',
      apiKey: 'test-key',
      isOcr: 'true',
      enableFormula: 'false',
      enableTable: 'true',
      language: 'en' as const,
      modelVersion: 'vlm' as const,
    };

    const toolset = await strategy.create(config);
    expect(toolset).toBeDefined();
    expect(toolset.constructor.name).toBe('MinerUToolset');
  });

  it('should return tools from createTools', () => {
    const tools = strategy.createTools();
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('mineru_pdf_parser');
  });

  it('should have apiKey in required fields', () => {
    const required = strategy.meta.configSchema.required;
    expect(required).toContain('apiKey');
  });

  it('should have apiUrl with default value', () => {
    const apiUrlSchema = strategy.meta.configSchema.properties?.apiUrl;
    expect(apiUrlSchema).toBeDefined();
    expect(apiUrlSchema.default).toBe('https://mineru.net/api/v4');
    expect(apiUrlSchema.type).toBe('string');
  });

  it('should have string enum fields with correct defaults', () => {
    const isOcrSchema = strategy.meta.configSchema.properties?.isOcr;
    expect(isOcrSchema).toBeDefined();
    expect(isOcrSchema.type).toBe('string');
    expect(isOcrSchema.enum).toEqual(['true', 'false']);
    expect(isOcrSchema.default).toBe('true');

    const enableFormulaSchema = strategy.meta.configSchema.properties?.enableFormula;
    expect(enableFormulaSchema).toBeDefined();
    expect(enableFormulaSchema.type).toBe('string');
    expect(enableFormulaSchema.enum).toEqual(['true', 'false']);
    expect(enableFormulaSchema.default).toBe('true');

    const enableTableSchema = strategy.meta.configSchema.properties?.enableTable;
    expect(enableTableSchema).toBeDefined();
    expect(enableTableSchema.type).toBe('string');
    expect(enableTableSchema.enum).toEqual(['true', 'false']);
    expect(enableTableSchema.default).toBe('true');
  });

  it('should validate config with null', async () => {
    await expect(strategy.validateConfig(null)).resolves.toBeUndefined();
  });

  it('should validate config with undefined', async () => {
    await expect(strategy.validateConfig(undefined)).resolves.toBeUndefined();
  });
});

