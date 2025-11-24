import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { CalculatorPlugin } from './lib/calculator.plugin.js';
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
    category: 'tools',
    icon: {
      type: 'image',
      value: icon
    },
    displayName: 'Calculator',
    description: 'Provide calculator tools',
    keywords: ['calculator', 'math', 'operations'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register calculator plugin');
    return { module: CalculatorPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('calculator plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('calculator plugin stopped');
  },
};

export default plugin;