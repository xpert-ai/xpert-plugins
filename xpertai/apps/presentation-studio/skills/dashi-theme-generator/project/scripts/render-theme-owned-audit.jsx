#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GENERATED_THEME_DEFINITIONS } from '../src/components/themes/generated-theme-definitions.mjs';

const root=path.resolve(import.meta.dirname,'..');
const themeKey=process.argv.includes('--theme')?process.argv[process.argv.indexOf('--theme')+1]:'';
if(!themeKey) throw new Error('--theme is required');
const definition=GENERATED_THEME_DEFINITIONS.find(theme=>theme.key===themeKey);
if(!definition?.ownModules) throw new Error(`${themeKey} has no registered theme-owned modules`);
const outputArg=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:`output/theme-owned-audit/${themeKey}.html`;
const output=path.resolve(process.cwd(),outputArg);
const runtimePath=path.join(root,'src/components/themes',themeKey,'runtime.jsx');
const runtime=await import(`${pathToFileURL(runtimePath).href}?ownedAudit=${Date.now()}`);
const pages=runtime.runtimePages.filter(page=>page.sourceTheme===themeKey);
if(!pages.length) throw new Error(`${themeKey} has no selected theme-owned runtime pages`);
const cards=pages.map(page=>{
  const Component=page.Component;
  const markup=renderToStaticMarkup(<Component {...page.defaultProps}/>);
  const provenance=page.evidenceMode==='inferred'
    ? `Style DNA: ${(page.derivedFromRules||[]).join(', ')} · anchors: ${(page.anchorModuleRefs||[]).join(', ')}`
    : (page.evidenceRefs||[]).join(', ');
  return `<article><header><b>${page.archetypeId}</b><span>${page.moduleFamily} · ${page.moduleStrategy} · ${page.evidenceMode||'observed'}</span><small>${provenance}</small></header><div class="viewport"><div class="slide">${markup}</div></div></article>`;
}).join('');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${themeKey} theme-owned modules</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#17191e;color:#fff;font:14px system-ui,sans-serif}body>h1{margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.grid>article{padding:12px;background:#24272f;border-radius:10px}.grid>article>header{height:38px;display:flex;align-items:center;gap:12px}.grid>article>header b{color:#ff9200}.grid>article>header small{margin-left:auto;color:#aeb5c4}.viewport{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}.slide{width:1920px;height:1080px;position:absolute;inset:0;transform-origin:0 0;transform:scale(var(--scale))}@media(max-width:1000px){.grid{grid-template-columns:1fr}}</style></head><body><h1>${themeKey} 外部模板自有模块审计</h1><main class="grid">${cards}</main><script>const resize=()=>document.querySelectorAll('.viewport').forEach(v=>v.style.setProperty('--scale',v.clientWidth/1920));addEventListener('resize',resize);resize();</script></body></html>`;
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,html);
console.log(`Rendered ${pages.length} theme-owned archetypes: ${output}`);
