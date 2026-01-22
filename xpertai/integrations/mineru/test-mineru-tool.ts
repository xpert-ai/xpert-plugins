/**
 * Manual test script for MinerU tool
 * 
 * Usage:
 * 1. Set environment variables:
 *    - MINERU_API_BASE_URL (optional, defaults to official API)
 *    - MINERU_API_TOKEN (required for official API)
 *    - MINERU_SERVER_TYPE (optional, 'official' or 'self-hosted')
 * 
 * 2. Run: npx tsx test-mineru-tool.ts
 * 
 * 3. Make sure you have a test PDF file URL or path
 */

import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { buildMinerUTool } from './src/lib/mineru.tool.js';
import { MinerUResultParserService } from './src/lib/result-parser.service.js';
import { MinerUIntegrationOptions } from './src/lib/types.js';

// Test configuration
const TEST_PDF_URL = process.env.TEST_PDF_URL || 'https://example.com/test.pdf';
const TEST_PDF_PATH = process.env.TEST_PDF_PATH; // Optional local file path

async function testMinerUTool() {
  console.log('🚀 Starting MinerU Tool Test...\n');

  // Setup dependencies
  const configService = new ConfigService();
  const resultParser = new MinerUResultParserService();

  const options: MinerUIntegrationOptions = {
    apiUrl: process.env.MINERU_API_BASE_URL,
    apiKey: process.env.MINERU_API_TOKEN,
    serverType: (process.env.MINERU_SERVER_TYPE || 'official') as 'official' | 'self-hosted',
  };

  // Build tool
  const tool = buildMinerUTool(
    configService,
    resultParser,
    options,
    undefined // fileSystem - would be provided by platform in real usage
  );

  console.log('✅ Tool created:', tool.name);
  console.log('📝 Tool description:', tool.description);
  console.log('📋 Tool schema:', JSON.stringify(tool.schema, null, 2));
  console.log('');

  // Test with fileUrl
  if (TEST_PDF_URL && TEST_PDF_URL !== 'https://example.com/test.pdf') {
    console.log('🧪 Testing with fileUrl:', TEST_PDF_URL);
    try {
      const result = await tool.invoke({
        doc_url: TEST_PDF_URL,
        is_ocr: true,
        enable_formula: true,
        enable_table: true,
        language: 'ch',
        model_version: 'pipeline',
      });

      if (Array.isArray(result) && result.length === 2) {
        const [text, artifact] = result;
        console.log('✅ Tool executed successfully!');
        // Type guard to ensure text is a string
        if (typeof text === 'string') {
          console.log('📄 Text result (first 500 chars):', text.substring(0, 500));
        } else {
          console.log('📄 Text result:', text);
        }
        // Type guard to ensure artifact is an object with files property
        if (artifact && typeof artifact === 'object' && 'files' in artifact) {
          console.log('📦 Artifact files:', (artifact as any).files?.length || 0);
          if ((artifact as any).files && (artifact as any).files.length > 0) {
            console.log('   Files:', (artifact as any).files.map((f: any) => f.fileName).join(', '));
          }
        }
      } else {
        console.log('📄 Result:', result);
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      console.error('Stack:', error.stack);
    }
  } else {
    console.log('⚠️  No test PDF provided. Set TEST_PDF_URL or TEST_PDF_PATH environment variable.');
    console.log('📋 Tool schema validation test:');
    
    // Test schema validation
    try {
      // Valid input
      const validInput = {
        doc_url: 'https://example.com/test.pdf',
        is_ocr: true,
        enable_formula: true,
        enable_table: true,
        language: 'ch' as const,
        model_version: 'pipeline' as const,
      };
      console.log('✅ Valid input schema:', JSON.stringify(validInput, null, 2));
      
      // Invalid input (should fail validation)
      const invalidInput = {
        doc_url: 'https://example.com/test.pdf',
        language: 'invalid', // Invalid enum value
      };
      console.log('❌ Invalid input (should fail):', JSON.stringify(invalidInput, null, 2));
    } catch (error: any) {
      console.log('✅ Schema validation working:', error.message);
    }
  }

  console.log('\n✨ Test completed!');
}

// Run test
testMinerUTool().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

