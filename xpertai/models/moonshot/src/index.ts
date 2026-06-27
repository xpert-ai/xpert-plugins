import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { MoonshotModule } from './moonshot.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read PNG icon as data URL. No fallback/try-catch: missing asset should fail fast.
const iconPngDataUrl =
  'data:image/png;base64,' +
  readFileSync(join(__dirname, '_assets/icon_s_en.png')).toString('base64');

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({});

const plugin: XpertPlugin<any> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'image',
      value: iconPngDataUrl,
    },
    displayName: 'Moonshot AI (Kimi)',
    description: 'Provide Moonshot AI (Kimi) Models with Long Context Support',
    keywords: ['Moonshot', 'Kimi', 'model', 'llm', 'long-context'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema as any,
  },
  register(ctx) {
    ctx.logger.log('register Moonshot plugin');
    return { module: MoonshotModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Moonshot plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Moonshot plugin stopped');
  },
};

export default plugin;
