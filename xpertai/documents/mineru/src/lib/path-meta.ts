import { dirname } from 'path';
import { fileURLToPath } from 'url';

export function getModuleMeta(meta?: ImportMeta) {
  const isESM = typeof require === 'undefined';
  const filename = isESM ? fileURLToPath(meta!.url) : __filename;
  const dir = isESM ? dirname(filename) : __dirname;
  return { __filename: filename, __dirname: dir };
}
