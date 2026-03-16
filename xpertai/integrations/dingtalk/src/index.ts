import { z } from 'zod';
import { type XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initI18n } from './lib/i18n.js';
import { iconImage } from './lib/types.js';
import { IntegrationDingTalkPluginConfigSchema } from './lib/plugin-config.js';
import { IntegrationDingTalkPlugin } from './lib/integration-dingtalk.module.js';
import { DINGTALK_PLUGIN_CONTEXT } from './lib/tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const plugin: XpertPlugin<z.infer<typeof IntegrationDingTalkPluginConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'integration',
    icon: {
      type: 'svg',
      value: iconImage
    },
    displayName: 'DingTalk Plugin',
    description: 'Bidirectional messaging integration with DingTalk platform',
    keywords: ['dingtalk', 'integration', 'message', 'webhook', 'stream'],
    author: 'XpertAI team',
  },
  config: {
    schema: IntegrationDingTalkPluginConfigSchema
  },
  permissions: [
    { type: 'integration', service: 'dingtalk', operations: ['read'] },
    { type: 'handoff', operations: ['enqueue'] }
  ],
  register(ctx) {
    ctx.logger.log('Registering DingTalk integration plugin')
    initI18n(join(__dirname, '../src'))
    return {
      module: IntegrationDingTalkPlugin,
      global: true,
      providers: [{ provide: DINGTALK_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  },
  async onStart(ctx) {
    ctx.logger.log('DingTalk integration plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('DingTalk integration plugin stopped')
  }
};

export default plugin;
