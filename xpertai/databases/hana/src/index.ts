import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SvgIcon } from './lib/types.js';
import { HANAPlugin } from './lib/hana.module.js';

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
    category: 'database',
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    displayName: 'SAP HANA Data Source',
    description: 'Provide SAP HANA database connectivity and querying capabilities',
    keywords: ['hana', 'database', 'datasource'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register hana data source plugin');
    return { module: HANAPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('hana data source plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('hana data source plugin stopped');
  },
};

export default plugin;