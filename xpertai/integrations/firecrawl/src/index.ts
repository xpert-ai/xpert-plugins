import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FirecrawlPlugin } from './lib/firecrawl.plugin.js';
import { icon } from './lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'integration',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Firecrawl',
    description: 'Integrate Firecrawl system functionality',
    keywords: ['firecrawl', 'document source', 'toolset'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register firecrawl plugin');
    return { module: FirecrawlPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('firecrawl plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('firecrawl plugin stopped');
  },
};

export default plugin;