import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { SvgIcon } from './types.js';
import { XinferenceModule } from './xinference.module.js';

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
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon
    },
    displayName: 'Xorbits Inference',
    description: 'Provide Xorbits Inference Models',
    keywords: ['Xinference', 'model'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Xinference plugin');
    return { module: XinferenceModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Xinference plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Xinference plugin stopped');
  },
};

export default plugin;