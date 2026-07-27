import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DINGTALK_ARTIFACT_NAMESPACE,
  DINGTALK_PLUGIN_RUNTIME_METADATA
} from './lib/constants.js';

describe('DingTalk plugin metadata', () => {
  it('keeps package and runtime artifact namespaces aligned', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
      xpert: { plugin: { artifactNamespace?: string } };
    };

    expect(DINGTALK_ARTIFACT_NAMESPACE).toBe('dingtalk');
    expect(DINGTALK_PLUGIN_RUNTIME_METADATA).toEqual({
      level: 'system',
      artifactNamespace: DINGTALK_ARTIFACT_NAMESPACE
    });
    expect(packageJson.xpert.plugin.artifactNamespace).toBe(
      DINGTALK_PLUGIN_RUNTIME_METADATA.artifactNamespace
    );
  });
});
