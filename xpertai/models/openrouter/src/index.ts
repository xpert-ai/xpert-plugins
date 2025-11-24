import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { OpenRouterModule } from './openrouter.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({});

const plugin: XpertPlugin<any> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-2 1L12 15.5l7-3.5-2-1-5 2.5z"/></svg>', // Placeholder SVG
    },
    displayName: 'OpenRouter',
    description: 'Provide OpenRouter Models',
    keywords: ['OpenRouter', 'model', 'llm'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema as any,
  },
  register(ctx) {
    ctx.logger.log('register OpenRouter plugin');
    return { module: OpenRouterModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('OpenRouter plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('OpenRouter plugin stopped');
  },
};

export default plugin;
