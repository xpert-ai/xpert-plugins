#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installGeneratedThemeSkill } from './install-generated-theme-skill.mjs';

const args=parseArgs(process.argv.slice(2));
const project=path.resolve(args.project||'');
const themeKey=String(args.theme||'');
if(!args.project||!/^theme\d{2,}$/.test(themeKey)) throw new Error('--project and a themeXX --theme are required');
if(!existsSync(path.join(project,'package.json'))) throw new Error(`Dashi project not found: ${project}`);

const generatorRoot=path.resolve(import.meta.dirname,'..');
const sourceSkill=path.dirname(project);
const installRoot=path.resolve(args['install-root']||path.join(os.homedir(),'.codex','skills','dashi-ppt'));
const reportPath=path.resolve(args.out||path.join('/tmp',`${themeKey}-finalize-report.json`));

const steps=[];
runNpm('themes:generate');
runNpm('manifest:update');
runNpm('themes:build-generated');
runNpm('themes:validate-generated');
runNpm('themes:validate-palette',['--theme',themeKey]);
runNpm('themes:render-owned',['--theme',themeKey]);
runNpm('themes:render-audit');
runNode(path.join(generatorRoot,'scripts','validate-theme-render-contract.mjs'),['--project',project,'--theme',themeKey,'--out',path.join('/tmp',`${themeKey}-render-contract.json`)]);
runNode(path.join(generatorRoot,'scripts','validate-generated-layout-quality.mjs'),['--project',project,'--theme',themeKey,'--out',path.join('/tmp',`${themeKey}-layout-quality.json`)]);
runNpm('themes:sync-skill');
runNpm('themes:style-grid');

const installResult=installGeneratedThemeSkill({sourceSkill,installRoot});
steps.push({name:'auto-install',...installResult});

run('npm',['--prefix',path.join(installRoot,'project'),'run','themes:validate-generated'],project,'installed-capability-validation');
run(process.execPath,[path.join(installRoot,'project','scripts','layout-query.mjs'),'--theme',themeKey,'--role','cover','--limit','1'],project,'installed-theme-query');

const report={theme:themeKey,passed:true,sourceSkill,installRoot,steps,completedAt:new Date().toISOString()};
writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(`Theme finalized and installed: ${themeKey}`);
console.log(`Active skill: ${installRoot}`);
console.log(`Report: ${reportPath}`);

function runNpm(script,forward=[]) {
  run('npm',['--prefix',project,'run',script,...(forward.length?['--',...forward]:[])],project,script);
}

function runNode(script,forward=[]) {
  run(process.execPath,[script,...forward],project,path.basename(script));
}

function run(command,commandArgs,cwd,name) {
  console.log(`\n[theme-finalize] ${name}`);
  const result=spawnSync(command,commandArgs,{cwd,stdio:'inherit',env:process.env});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${name} failed with exit code ${result.status}`);
  steps.push({name,status:'passed'});
}

function parseArgs(argv) {
  const parsed={};
  for(let index=0;index<argv.length;index+=1) {
    const token=argv[index];
    if(!token.startsWith('--')) continue;
    const key=token.slice(2);
    const next=argv[index+1];
    parsed[key]=next&&!next.startsWith('--')?(index+=1,next):true;
  }
  return parsed;
}
