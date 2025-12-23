/**
 * Simple test script to verify if deepseek-reasoner still has developer role errors
 * 
 * Usage:
 * 1. Create .env file in project root directory, add: DEEPSEEK_API_KEY=your_api_key_here
 * 2. Run: npx tsx test/test-developer-role-fix-simple.ts
 * 
 * Or use ts-node:
 * npx ts-node --esm test/test-developer-role-fix-simple.ts
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DeepSeekChatOAICompatReasoningModel } from '../dist/llm/llm.js';
import { testConfig, validateConfig } from './config.js';

async function testDeepSeekReasoner() {
  // Validate configuration
  if (!validateConfig()) {
    process.exit(1);
  }

  console.log('🧪 Starting test for deepseek-reasoner model...\n');

  // Create model instance
  // Note: DeepSeekChatOAICompatReasoningModel uses OpenAI SDK, requires configuration object
  const model = new DeepSeekChatOAICompatReasoningModel({
    model: 'deepseek-reasoner',
    apiKey: testConfig.apiKey,
    configuration: {
      baseURL: testConfig.baseURL,
    },
  });

  // Test messages (containing system message)
  const messages = [
    new SystemMessage('You are a helpful AI assistant'),
    new HumanMessage('Who are you?'),
  ];

  console.log('📤 Sending request:');
  console.log('   Model: deepseek-reasoner');
  console.log('   Messages:', messages.map(m => ({
    type: m._getType(),
    content: typeof m.content === 'string' ? m.content.substring(0, 50) : '[...]'
  })));
  console.log('');

  try {
    console.log('⏳ Waiting for API response...\n');
    
    const response = await model.invoke(messages);
    
    console.log('✅ Test successful!');
    console.log('📥 Response content:');
    console.log('   ', response.content);
    console.log('');
    
    // Check if reasoning_content exists
    if (response.additional_kwargs?.reasoning_content) {
      console.log('💭 Reasoning content:');
      console.log('   ', response.additional_kwargs.reasoning_content);
      console.log('');
    }
    
    console.log('✅ No developer role error occurred! Fix successful!');
    
  } catch (error: any) {
    console.error('❌ Test failed!');
    console.error('   Error:', error.message);
    
    if (error.message?.includes('developer')) {
      console.error('\n❌ Developer role error still occurs!');
      console.error('   This indicates the fix may not have taken effect, or the platform is still using an old version.');
      process.exit(1);
    } else if (error.message?.includes('400')) {
      console.error('\n❌ 400 error occurred!');
      console.error('   Error details:', error);
      process.exit(1);
    } else {
      console.error('\n⚠️  Other error (may be API key or network issue)');
      console.error('   Error details:', error);
      process.exit(1);
    }
  }
}

// Run test
testDeepSeekReasoner().catch((error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
