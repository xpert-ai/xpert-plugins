import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { IntegrationDifyPlugin } from './lib/integration-dify.plugin.js';

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
      type: 'image',
      value: `/assets/images/integrations/dify.svg`
    },
    displayName: 'Dify Integration',
    description: 'Provide Dify integration strategy',
    keywords: ['integration', 'dify'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register dify plugin');
    return { module: IntegrationDifyPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('dify plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('dify plugin stopped');
  },
};

export default plugin;