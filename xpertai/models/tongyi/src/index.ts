import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { TongyiModule } from './tongyi.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({});
const svgIcon = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="6" fill="#EFF1FE"/>
  <path d="M6 7.5C6 6.67157 6.67157 6 7.5 6H16.5C17.3284 6 18 6.67157 18 7.5V16.5C18 17.3284 17.3284 18 16.5 18H7.5C6.67157 18 6 17.3284 6 16.5V7.5Z" fill="#4F46E5"/>
  <path d="M9 9H15V10.8H12.9V15H11.1V10.8H9V9Z" fill="white"/>
</svg>`;

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: svgIcon,
    },
    displayName: 'Tongyi',
    description: 'Provide Tongyi / DashScope models through XpertAI model providers',
    keywords: ['Tongyi', 'DashScope', 'Qwen', 'embedding', 'rerank', 'speech2text', 'tts'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Tongyi plugin');
    return { module: TongyiModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Tongyi plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Tongyi plugin stopped');
  },
};

export default plugin;
