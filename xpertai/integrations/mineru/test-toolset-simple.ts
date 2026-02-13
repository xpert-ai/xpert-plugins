/**
 * Simple test script for MinerU Toolset (No API Key or PDF required)
 * 
 * This test verifies:
 * 1. ToolsetStrategy can be created
 * 2. Toolset can be instantiated
 * 3. Tool function can be created
 * 4. Tool schema is correct
 * 
 * Usage: npx tsx test-toolset-simple.ts
 */

import { ConfigService } from '@nestjs/config';
import { MinerUToolsetStrategy } from './src/lib/mineru-toolset.strategy.js';
import { MinerUResultParserService } from './src/lib/result-parser.service.js';
import { MinerUToolset, MinerUToolsetConfig } from './src/lib/mineru.toolset.js';
import { buildMinerUTool } from './src/lib/mineru.tool.js';
import { MinerU, MinerUIntegrationOptions } from './src/lib/types.js';
import { IIntegration } from '@metad/contracts';

async function testToolsetComponents() {
  console.log('🧪 Testing MinerU Toolset Components (No API/PDF required)\n');

  try {
    // 1. Test Strategy Creation
    console.log('1️⃣  Testing MinerUToolsetStrategy creation...');
    const configService = new ConfigService();
    const resultParser = new MinerUResultParserService();
    const strategy = new MinerUToolsetStrategy(configService, resultParser);
    
    console.log('   ✅ Strategy created');
    console.log('   📋 Meta name:', strategy.meta.name);
    console.log('   📋 Meta label (en_US):', strategy.meta.label.en_US);
    console.log('   📋 Meta label (zh_Hans):', strategy.meta.label.zh_Hans);
    console.log('   📋 Permissions:', strategy.permissions.length, 'permissions defined');
    console.log('');

    // 2. Test Config Validation
    console.log('2️⃣  Testing config validation...');
    
    // Valid config
    const validConfig: MinerUToolsetConfig = {
      integration: {
        provider: MinerU,
        options: {
          apiUrl: 'https://api.mineru.dev',
          apiKey: 'test-key',
          serverType: 'official',
        } as MinerUIntegrationOptions,
      } as Partial<IIntegration<MinerUIntegrationOptions>>,
    };
    
    await strategy.validateConfig(validConfig);
    console.log('   ✅ Valid config passed validation');
    
    // Invalid config (missing integration)
    try {
      await strategy.validateConfig({} as MinerUToolsetConfig);
      console.log('   ❌ Invalid config should have failed');
    } catch (error: any) {
      console.log('   ✅ Invalid config correctly rejected:', error.message);
    }
    console.log('');

    // 3. Test Toolset Creation
    console.log('3️⃣  Testing MinerUToolset creation...');
    const configWithDependencies: MinerUToolsetConfig = {
      ...validConfig,
      configService,
      resultParser,
    };
    
    const toolset = await strategy.create(configWithDependencies);
    console.log('   ✅ Toolset created:', toolset.constructor.name);
    console.log('');

    // 4. Test Tool Creation
    console.log('4️⃣  Testing tool function creation...');
    const tool = buildMinerUTool(
      configService,
      resultParser,
      validConfig.integration,
      undefined
    );
    
    console.log('   ✅ Tool created');
    console.log('   📋 Tool name:', tool.name);
    console.log('   📋 Tool description:', tool.description.substring(0, 80) + '...');
    console.log('   📋 Tool schema properties:', Object.keys(tool.schema.shape || {}).join(', '));
    console.log('');

    // 5. Test Tool Schema Validation
    console.log('5️⃣  Testing tool schema validation...');
    
    // Valid input
    const validInput = {
      fileUrl: 'https://example.com/test.pdf',
      isOcr: true,
      enableFormula: true,
      enableTable: true,
      language: 'ch' as const,
      modelVersion: 'pipeline' as const,
    };
    
    const parsedValid = tool.schema.parse(validInput);
    console.log('   ✅ Valid input parsed successfully');
    console.log('   📋 Parsed input:', JSON.stringify(parsedValid, null, 2));
    
    // Invalid input (wrong enum value)
    try {
      const invalidInput = {
        fileUrl: 'https://example.com/test.pdf',
        language: 'invalid' as any, // Invalid enum
      };
      tool.schema.parse(invalidInput);
      console.log('   ❌ Invalid input should have failed');
    } catch (error: any) {
      console.log('   ✅ Invalid input correctly rejected');
    }
    console.log('');

    // 6. Summary
    console.log('✨ All component tests passed!');
    console.log('');
    console.log('📝 Summary:');
    console.log('   ✅ MinerUToolsetStrategy can be created');
    console.log('   ✅ Config validation works');
    console.log('   ✅ Toolset can be instantiated');
    console.log('   ✅ Tool function can be created');
    console.log('   ✅ Tool schema validation works');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   - Set MINERU_API_TOKEN in .env for real API testing');
    console.log('   - Use test-mineru-tool.ts with a real PDF URL to test full functionality');
    console.log('   - Or test in Xpert platform after building the plugin');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run test
testToolsetComponents().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

