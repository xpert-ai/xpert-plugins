import { z } from 'zod';
import { type XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initI18n } from './lib/i18n.js';
import { iconImage } from './lib/types.js';
import { IntegrationLarkPluginConfigSchema } from './lib/plugin-config.js';
import { IntegrationLarkPlugin } from './lib/integration-lark.module.js';
import { LARK_PLUGIN_CONTEXT } from './lib/tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const plugin: XpertPlugin<z.infer<typeof IntegrationLarkPluginConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'integration',
    icon: {
      type: 'image',
      value: iconImage
    },
    displayName: 'Lark/Feishu Plugin',
    description: 'Bidirectional messaging integration with Lark (Feishu) platform',
    keywords: ['lark', 'feishu', 'document source', 'knowledge', 'integration'],
    author: 'XpertAI team',
  },
  config: {
    schema: IntegrationLarkPluginConfigSchema
  },
  permissions: [
    { type: 'integration', service: 'lark', operations: ['read'] },
    { type: 'user', operations: ['read', 'write'] },
    { type: 'handoff', operations: ['enqueue'] },
    { type: 'analytics', operations: ['model', 'dscore', 'query', 'create_indicator'] }
  ],
  register(ctx) {
    ctx.logger.log('Registering Lark integration plugin')
    initI18n(join(__dirname, '../src'))
    return {
      module: IntegrationLarkPlugin,
      global: true,
      providers: [{ provide: LARK_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  },
  async onStart(ctx) {
    ctx.logger.log('Lark integration plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Lark integration plugin stopped')
  }
};

export default plugin;