/**
 * Test environment configuration file
 * 
 * Usage:
 * 1. Create .env file in project root directory (xpert-plugins/xpertai/)
 * 2. Add to .env file: DEEPSEEK_API_KEY=your_api_key_here
 * 3. Do not commit .env file to Git (already excluded in .gitignore)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const configFileUrl = fileURLToPath(import.meta.url);
const configFileDir = dirname(configFileUrl);

/**
 * Load environment variables from root directory's .env file
 */
function loadEnvFromRoot(): Record<string, string> {
  const env: Record<string, string> = {};
  
  // Navigate up from deepseek plugin directory to root directory (xpertai)
  // test/ -> models/deepseek/ -> models/ -> xpertai/
  const rootDir = join(configFileDir, '..', '..', '..'); // xpertai/
  
  // Try to read .env file
  const envPath = join(rootDir, '.env');
  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, 'utf-8');
      
      // Parse .env file content
      envContent.split('\n').forEach((line) => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            // Remove quotes
            const cleanValue = value.replace(/^["']|["']$/g, '');
            env[key.trim()] = cleanValue;
          }
        }
      });
    } catch (error) {
      console.warn('⚠️  Failed to read .env file:', error);
    }
  }
  
  return env;
}

// Load environment variables
const envVars = loadEnvFromRoot();

export const testConfig = {
  /**
   * DeepSeek API Key
   * Read from root directory's .env file or DEEPSEEK_API_KEY environment variable
   */
  apiKey: envVars.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',

  /**
   * DeepSeek API Base URL
   * Default: https://api.deepseek.com/v1
   */
  baseURL: envVars.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',

  /**
   * Test timeout (milliseconds)
   * Default: 30000 (30 seconds)
   */
  timeout: parseInt(envVars.DEEPSEEK_TEST_TIMEOUT || process.env.DEEPSEEK_TEST_TIMEOUT || '30000', 10),
};

/**
 * Validate configuration is complete
 */
export function validateConfig(): boolean {
  if (!testConfig.apiKey) {
    console.error('❌ Error: Please set DEEPSEEK_API_KEY');
    console.log('   Method 1: Create .env file in project root directory (xpertai/), add:');
    console.log('   DEEPSEEK_API_KEY=your_api_key_here');
    console.log('');
    console.log('   Method 2: Set environment variable:');
    console.log('   export DEEPSEEK_API_KEY=your_api_key_here');
    console.log('   or Windows: set DEEPSEEK_API_KEY=your_api_key_here');
    return false;
  }
  return true;
}
