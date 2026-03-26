import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { SiliconflowModule } from './siliconflow.module.js';

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
  <rect width="24" height="24" rx="6" fill="#FFE7FF"/>
  <path d="M6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18H8.2V14.8H12C13.5464 14.8 14.8 13.5464 14.8 12C14.8 10.4536 13.5464 9.2 12 9.2C10.4536 9.2 9.2 10.4536 9.2 12V13.4H6V12Z" fill="#E11D8D"/>
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
    displayName: 'SiliconFlow',
    description: 'Provide SiliconFlow models through XpertAI model providers',
    keywords: ['SiliconFlow', 'llm', 'embedding', 'rerank', 'speech2text', 'tts'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register SiliconFlow plugin');
    return { module: SiliconflowModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('SiliconFlow plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('SiliconFlow plugin stopped');
  },
};

export default plugin;
