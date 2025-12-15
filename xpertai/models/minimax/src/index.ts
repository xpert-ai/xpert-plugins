import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MiniMaxModule } from './minimax.module.js';

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as {
  name: string;
  version: string;
};

// 配置Schema - OpenAI兼容API简化版本
const ConfigSchema = z.object({
  api_key: z.string().min(1, "API密钥不能为空"),
  base_url: z.string().url().optional().describe("API基础URL，默认使用官方OpenAI兼容端点"),
});

// MiniMax SVG图标
const SvgIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="24" rx="6" fill="url(#paint0_linear_7301_16076)"/>
<path d="M12 4C12 4 8 8 8 12C8 16 12 20 12 20C12 20 16 16 16 12C16 8 12 4 12 4Z" fill="white" fill-opacity="0.88"/>
<path d="M12 8C10 8 8 10 8 12C8 14 10 16 12 16C14 16 16 14 16 12C16 10 14 8 12 8Z" fill="white"/>
<defs>
<linearGradient id="paint0_linear_7301_16076" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FF6B6B"/>
<stop offset="1" stop-color="#4ECDC4"/>
</linearGradient>
</defs>
</svg>`;

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    displayName: 'MiniMax',
    description: 'Provide MiniMax AI Models using OpenAI Compatible API (LLM, Embedding, TTS)',
    keywords: ['MiniMax', 'model', 'chinese', 'ai', 'openai-compatible'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register MiniMax plugin');
    return { module: MiniMaxModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('MiniMax plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('MiniMax plugin stopped');
  },
};

export { ConfigSchema };
export default plugin;
