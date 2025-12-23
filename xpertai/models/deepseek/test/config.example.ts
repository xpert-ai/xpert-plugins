/**
 * 测试环境配置文件示例
 * 
 * 注意：实际配置已改为从根目录的 .env 文件读取
 * 此文件仅作为参考
 */

export const testConfig = {
  /**
   * DeepSeek API Key
   * 现在从根目录的 .env 文件读取：DEEPSEEK_API_KEY
   */
  apiKey: '', // 不再使用，请使用 .env 文件

  /**
   * DeepSeek API Base URL
   * 现在从根目录的 .env 文件读取：DEEPSEEK_BASE_URL
   */
  baseURL: 'https://api.deepseek.com/v1',

  /**
   * 测试超时时间（毫秒）
   * 现在从根目录的 .env 文件读取：DEEPSEEK_TEST_TIMEOUT
   */
  timeout: 30000,
};

/**
 * 验证配置是否完整
 */
export function validateConfig(): boolean {
  if (!testConfig.apiKey) {
    console.error('❌ 错误：请设置 DEEPSEEK_API_KEY');
    return false;
  }
  return true;
}
