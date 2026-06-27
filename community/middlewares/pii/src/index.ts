import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PiiPlugin } from './lib/pii.module.js';
import { PiiIcon } from './lib/types.js';

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
      value: PiiIcon,
    },
    displayName: 'PII Detection Middleware',
    description: 'Detect and redact Personally Identifiable Information (PII) in agent messages. Supports built-in PII types (SSN, email, phone, credit card, IP address) and custom detectors with multiple redaction strategies.',
    keywords: ['agent', 'middleware', 'pii', 'privacy', 'security', 'redaction'],
    author: 'Community Contributor',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register PII detection middleware plugin');
    return { module: PiiPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('PII detection middleware plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('PII detection middleware plugin stopped');
  },
};

export default plugin;
