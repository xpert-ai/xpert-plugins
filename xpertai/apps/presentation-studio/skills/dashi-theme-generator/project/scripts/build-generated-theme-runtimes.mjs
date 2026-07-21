#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_THEME_KEYS } from '../src/components/themes/generated-theme-definitions.mjs';
import { buildThemeModule, buildClientRuntimeFromModules, themeBundleFileName } from '../src/components/themes/runtime-build.mjs';

const root=path.resolve(import.meta.dirname,'..');
const outDir=path.join(root,'dist/theme-runtime');
fs.mkdirSync(outDir,{recursive:true});
for (const key of GENERATED_THEME_KEYS) {
  buildThemeModule({root,themeKey:key,outDir});
  buildClientRuntimeFromModules({root,outFile:path.join(outDir,themeBundleFileName(key)),themeKeys:[key],moduleDir:outDir});
  console.log(`Built ${key}`);
}
