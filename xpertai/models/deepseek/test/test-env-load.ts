/**
 * Test .env file loading functionality
 * Used to verify if configuration can be correctly read from root directory's .env file
 */

import { testConfig, validateConfig } from './config.js';

console.log('🧪 Testing .env file loading functionality\n');

console.log('📋 Current configuration:');
console.log('   API Key:', testConfig.apiKey ? `${testConfig.apiKey.substring(0, 10)}...` : 'Not set');
console.log('   Base URL:', testConfig.baseURL);
console.log('   Timeout:', testConfig.timeout, 'ms');
console.log('');

if (validateConfig()) {
  console.log('✅ Configuration validation passed!');
  console.log('   .env file is loaded correctly and tests can be run');
} else {
  console.log('❌ Configuration validation failed!');
  console.log('   Please check DEEPSEEK_API_KEY setting in .env file');
}
