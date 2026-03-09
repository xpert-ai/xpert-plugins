import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SensitiveFilterPlugin } from './lib/sensitive-filter.module.js';
import { SensitiveFilterIcon } from './lib/types.js';

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
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SensitiveFilterIcon,
    },
    displayName: 'Sensitive Filter Middleware',
    description: 'Filter sensitive content for agent input and model output with business rules and optional general pack.',
    keywords: ['agent', 'middleware', 'sensitive', 'security', 'compliance'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register sensitive filter middleware plugin');
    return { module: SensitiveFilterPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('sensitive filter middleware plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('sensitive filter middleware plugin stopped');
  },
};

export default plugin;
