/**
 * 测试环境配置文件示例
 * 
 * 使用方法：
 * 1. 复制此文件为 config.ts: cp config.example.ts config.ts
 * 2. 在 config.ts 中填入你的 DeepSeek API Key
 * 3. config.ts 已在 .gitignore 中，不会被提交到 Git
 */

export const testConfig = {
  /**
   * DeepSeek API Key
   * 从 https://platform.deepseek.com/api_keys 获取
   */
  apiKey: '', // 请在此处填入你的 API Key

  /**
   * DeepSeek API Base URL
   * 默认: https://api.deepseek.com/v1
   */
  baseURL: 'https://api.deepseek.com/v1',

  /**
   * 测试超时时间（毫秒）
   * 默认: 30000 (30秒)
   */
  timeout: 30000,
};

/**
 * 验证配置是否完整
 */
export function validateConfig(): boolean {
  if (!testConfig.apiKey) {
    console.error('❌ 错误：请在 test/config.ts 中设置 apiKey');
    console.log('   打开 test/config.ts 文件，填入你的 DeepSeek API Key');
    return false;
  }
  return true;
}

