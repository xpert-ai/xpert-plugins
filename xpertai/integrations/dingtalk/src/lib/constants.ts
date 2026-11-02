import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8')) as {
  xpert: { plugin: { level: 'system'; artifactNamespace: string } };
};

export const DINGTALK_ARTIFACT_NAMESPACE = packageJson.xpert.plugin.artifactNamespace;

export const DINGTALK_PLUGIN_RUNTIME_METADATA = {
  level: packageJson.xpert.plugin.level,
  artifactNamespace: DINGTALK_ARTIFACT_NAMESPACE
} as const;
