import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ModelFallbackPlugin } from './lib/model-fallback.module.js';
import { ModelFallbackIcon } from './lib/types.js';

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
      value: ModelFallbackIcon,
      color: "#673AB7",
    },
    displayName: 'Model Fallback Middleware',
    description: 'Automatically fallback to alternative models when the primary model fails. Useful for handling model outages, cost optimization, and provider redundancy.',
    keywords: ['agent', 'middleware', 'model fallback'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register model fallback middleware plugin');
    return { module: ModelFallbackPlugin, global: false };
  },
  async onStart(ctx) {
    ctx.logger.log('model fallback middleware plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('model fallback middleware plugin stopped');
  },
};

export default plugin;