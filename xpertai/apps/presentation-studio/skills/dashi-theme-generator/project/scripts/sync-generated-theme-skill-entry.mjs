#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_THEME_PACKS } from '../src/components/themes/generated-metadata.js';

const project=path.resolve(import.meta.dirname,'..');
const skillRoot=path.dirname(project);
const skillPath=path.join(skillRoot,'SKILL.md');
const readmePath=path.join(skillRoot,'README.md');
const themes=[...GENERATED_THEME_PACKS].sort((a,b)=>a.key.localeCompare(b.key));
if(!themes.length) throw new Error('No generated theme packs are available');

const styleLine=`- 当前可选风格: ${themes.map(theme=>`\`${theme.key}\` ${theme.displayName}`).join('、')}。`;
const hints=themes.map(theme=>`  - \`${theme.key}\` ${theme.displayName} | 适合: ${compact(theme.scenario,3)} | 人群: ${compact(theme.audience,2)}`).join('\n');
let skill=fs.readFileSync(skillPath,'utf8');
if(!/^- 当前可选风格:.*$/m.test(skill)) throw new Error('SKILL.md is missing the current-style line');
if(!/<!-- theme-choice-hints:start -->[\s\S]*?<!-- theme-choice-hints:end -->/.test(skill)) throw new Error('SKILL.md is missing theme-choice-hints markers');
skill=skill.replace(/^- 当前可选风格:.*$/m,styleLine).replace(/<!-- theme-choice-hints:start -->[\s\S]*?<!-- theme-choice-hints:end -->/,`<!-- theme-choice-hints:start -->\n${hints}\n<!-- theme-choice-hints:end -->`);
fs.writeFileSync(skillPath,skill);

let readme=fs.readFileSync(readmePath,'utf8');
const readmeList=themes.map(theme=>`- \`${theme.key}\` ${theme.displayName} (${theme.pageCount} 页): 适配场景: ${theme.scenario}; 适配人群: ${theme.audience}`).join('\n');
const styleSection=`## 当前风格\n\n当前包含 ${themes.length} 套已接入风格:\n\n${readmeList}\n\n每套风格都有独立的页面结构和视觉语言,适合不同类型的报告和展示场景。`;
if(!/## 当前风格[\s\S]*?每套风格都有独立的页面结构和视觉语言,适合不同类型的报告和展示场景。/.test(readme)) throw new Error('README.md current-style section was not found');
readme=readme.replace(/## 当前风格[\s\S]*?每套风格都有独立的页面结构和视觉语言,适合不同类型的报告和展示场景。/,styleSection);
fs.writeFileSync(readmePath,readme);

console.log(`Synchronized ${themes.length} themes into ${skillPath} and ${readmePath}`);

function compact(value,limit) {
  return String(value||'').split(/[、,，]/).map(item=>item.trim()).filter(Boolean).slice(0,limit).join(' / ');
}
