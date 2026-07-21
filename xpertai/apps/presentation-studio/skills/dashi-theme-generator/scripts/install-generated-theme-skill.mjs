#!/usr/bin/env node
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function installGeneratedThemeSkill({sourceSkill,installRoot,stdio='inherit'}={}) {
  const source=path.resolve(sourceSkill||'');
  const target=path.resolve(installRoot||'');
  validateTargets(source,target);
  const sourceReal=realpathSync(source);
  const targetReal=existsSync(target)?realpathSync(target):target;
  if(sourceReal===targetReal) return {status:'already-active',target};
  mkdirSync(target,{recursive:true});
  const result=spawnSync('rsync',['-a','--delete',"--exclude=project/node_modules/","--exclude=project/output/","--exclude=.DS_Store",`${source}${path.sep}`,`${target}${path.sep}`],{stdio});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`auto-install failed with exit code ${result.status}`);
  return {status:'installed',target};
}

function validateTargets(source,target) {
  if(path.basename(source)!=='dashi-ppt'||!existsSync(path.join(source,'SKILL.md'))||!existsSync(path.join(source,'project','package.json'))) {
    throw new Error(`Refusing to sync from a non dashi-ppt skill root: ${source}`);
  }
  if(path.basename(target)!=='dashi-ppt') throw new Error(`Install target must end in dashi-ppt: ${target}`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [sourceSkill,installRoot]=process.argv.slice(2);
  if(!sourceSkill||!installRoot) throw new Error('Usage: install-generated-theme-skill.mjs <source-skill> <install-root>');
  console.log(JSON.stringify(installGeneratedThemeSkill({sourceSkill,installRoot}),null,2));
}
