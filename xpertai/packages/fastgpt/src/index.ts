import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { IntegrationFastGPTPlugin } from './lib/integration-fastgpt.plugin.js';
import { SvgIcon } from './lib/types.js';

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
      value: SvgIcon
    },
    displayName: 'FastGPT Integration',
    description: 'Provide FastGPT integration strategy',
    keywords: ['integration', 'fastgpt'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register fastgpt plugin');
    return { module: IntegrationFastGPTPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('fastgpt plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('fastgpt plugin stopped');
  },
};

export default plugin;