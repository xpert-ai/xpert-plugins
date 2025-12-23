/**
 * 测试 .env 文件加载功能
 * 用于验证配置是否能正确从根目录的 .env 文件读取
 */

import { testConfig, validateConfig } from './config.js';

console.log('🧪 测试 .env 文件加载功能\n');

console.log('📋 当前配置：');
console.log('   API Key:', testConfig.apiKey ? `${testConfig.apiKey.substring(0, 10)}...` : '未设置');
console.log('   Base URL:', testConfig.baseURL);
console.log('   Timeout:', testConfig.timeout, 'ms');
console.log('');

if (validateConfig()) {
  console.log('✅ 配置验证通过！');
  console.log('   .env 文件已正确加载，可以运行测试');
} else {
  console.log('❌ 配置验证失败！');
  console.log('   请检查 .env 文件中的 DEEPSEEK_API_KEY 设置');
}

