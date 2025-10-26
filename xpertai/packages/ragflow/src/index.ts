import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { IntegrationRAGFlowPlugin } from './lib/integration-ragflow.plugin.js';
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
    displayName: 'RAGFlow Integration',
    description: 'Provide RAGFlow integration strategy',
    keywords: ['integration', 'ragflow'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register ragflow plugin');
    return { module: IntegrationRAGFlowPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('ragflow plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('ragflow plugin stopped');
  },
};

export default plugin;