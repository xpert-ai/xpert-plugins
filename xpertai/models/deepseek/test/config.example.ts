/**
 * Test environment configuration file example
 * 
 * Note: Actual configuration has been changed to read from root directory's .env file
 * This file is for reference only
 */

export const testConfig = {
  /**
   * DeepSeek API Key
   * Now read from root directory's .env file: DEEPSEEK_API_KEY
   */
  apiKey: '', // No longer used, please use .env file

  /**
   * DeepSeek API Base URL
   * Now read from root directory's .env file: DEEPSEEK_BASE_URL
   */
  baseURL: 'https://api.deepseek.com/v1',

  /**
   * Test timeout (milliseconds)
   * Now read from root directory's .env file: DEEPSEEK_TEST_TIMEOUT
   */
  timeout: 30000,
};

/**
 * Validate configuration is complete
 */
export function validateConfig(): boolean {
  if (!testConfig.apiKey) {
    console.error('❌ Error: Please set DEEPSEEK_API_KEY');
    return false;
  }
  return true;
}
