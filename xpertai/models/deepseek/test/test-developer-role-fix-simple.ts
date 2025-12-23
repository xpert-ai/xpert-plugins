/**
 * 简单的测试脚本，用于验证 deepseek-reasoner 是否还会出现 developer role 错误
 * 
 * 使用方法：
 * 1. 在项目根目录创建 .env 文件，添加：DEEPSEEK_API_KEY=your_api_key_here
 * 2. 运行：npx tsx test/test-developer-role-fix-simple.ts
 * 
 * 或者使用 ts-node：
 * npx ts-node --esm test/test-developer-role-fix-simple.ts
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DeepSeekChatOAICompatReasoningModel } from '../dist/llm/llm.js';
import { testConfig, validateConfig } from './config.js';

async function testDeepSeekReasoner() {
  // 验证配置
  if (!validateConfig()) {
    process.exit(1);
  }

  console.log('🧪 开始测试 deepseek-reasoner 模型...\n');

  // 创建模型实例
  // 注意：DeepSeekChatOAICompatReasoningModel 使用 OpenAI SDK，需要 configuration 对象
  const model = new DeepSeekChatOAICompatReasoningModel({
    model: 'deepseek-reasoner',
    apiKey: testConfig.apiKey,
    configuration: {
      baseURL: testConfig.baseURL,
    },
  });

  // 测试消息（包含 system message）
  const messages = [
    new SystemMessage('你是一个有用的AI助手'),
    new HumanMessage('你是谁啊？'),
  ];

  console.log('📤 发送请求：');
  console.log('   Model: deepseek-reasoner');
  console.log('   Messages:', messages.map(m => ({
    type: m._getType(),
    content: typeof m.content === 'string' ? m.content.substring(0, 50) : '[...]'
  })));
  console.log('');

  try {
    console.log('⏳ 等待 API 响应...\n');
    
    const response = await model.invoke(messages);
    
    console.log('✅ 测试成功！');
    console.log('📥 响应内容：');
    console.log('   ', response.content);
    console.log('');
    
    // 检查是否有 reasoning_content
    if (response.additional_kwargs?.reasoning_content) {
      console.log('💭 推理内容：');
      console.log('   ', response.additional_kwargs.reasoning_content);
      console.log('');
    }
    
    console.log('✅ 没有出现 developer role 错误！修复成功！');
    
  } catch (error: any) {
    console.error('❌ 测试失败！');
    console.error('   错误信息:', error.message);
    
    if (error.message?.includes('developer')) {
      console.error('\n❌ 仍然出现 developer role 错误！');
      console.error('   这表明修复可能没有生效，或者平台仍在使用旧版本。');
      process.exit(1);
    } else if (error.message?.includes('400')) {
      console.error('\n❌ 出现 400 错误！');
      console.error('   错误详情:', error);
      process.exit(1);
    } else {
      console.error('\n⚠️  其他错误（可能是 API key 或网络问题）');
      console.error('   错误详情:', error);
      process.exit(1);
    }
  }
}

// 运行测试
testDeepSeekReasoner().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});

