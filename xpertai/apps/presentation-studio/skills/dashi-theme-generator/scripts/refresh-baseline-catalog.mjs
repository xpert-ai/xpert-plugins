#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--project');
if(index<0||!process.argv[index+1]) {
  console.error('Usage: refresh-baseline-catalog.mjs --project /path/to/dashi-ppt/project');
  process.exit(2);
}
const project=path.resolve(process.argv[index+1]);
const analyzer=path.join(project,'scripts/analyze-theme-baselines.mjs');
const output=path.join(root,'references/baseline-module-catalog.json');
const run=spawnSync(process.execPath,[analyzer,'--json','--out',output],{cwd:project,stdio:'inherit'});
if(run.error) throw run.error;
process.exit(run.status??1);
