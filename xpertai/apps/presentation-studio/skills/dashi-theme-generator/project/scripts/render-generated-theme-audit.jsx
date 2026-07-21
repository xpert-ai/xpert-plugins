#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GENERATED_THEME_DEFINITIONS } from '../src/components/themes/generated-theme-definitions.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'output/generated-theme-audit/index.html'));
const cards = [];

for (const theme of GENERATED_THEME_DEFINITIONS) {
  const runtimePath = path.join(root, 'src/components/themes', theme.key, 'runtime.jsx');
  const runtime = await import(`${pathToFileURL(runtimePath).href}?audit=${Date.now()}`);
  const samples = [8, 16, 17].map(index => {
    const page=runtime.runtimePages[index];
    const Component=page.Component;
    const markup=renderToStaticMarkup(<Component {...page.defaultProps} page={String(index+1).padStart(2,'0')} total={String(runtime.runtimePages.length)} />);
    return `<section><label>${page.slot}</label><div class="viewport"><div class="slide">${markup}</div></div></section>`;
  }).join('');
  cards.push(`<article><header><b>${theme.key}</b><span>${theme.displayName}</span><small>${theme.profile.frame} · ${theme.profile.chart}</small></header>${samples}</article>`);
}

const firstTheme=GENERATED_THEME_DEFINITIONS.at(0)?.key||'generated';
const lastTheme=GENERATED_THEME_DEFINITIONS.at(-1)?.key||'generated';
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Generated Theme Architecture Audit</title><style>
*{box-sizing:border-box}body{margin:0;padding:32px;background:#111318;color:#f6f7fb;font:14px/1.4 Inter,system-ui,sans-serif}h1{margin:0 0 8px;font-size:30px}p{margin:0 0 28px;color:#9ca6b7}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#1b1f27;border:1px solid #303744;border-radius:14px;padding:14px}header{height:38px;display:flex;align-items:baseline;gap:10px}header b{color:#6ee7b7}header span{font-weight:700}header small{margin-left:auto;color:#8792a5}section{position:relative;margin-top:12px}section label{position:absolute;z-index:20;left:8px;top:8px;padding:3px 7px;border-radius:4px;background:#111b;color:#fff;font:11px monospace}.viewport{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000;border-radius:8px}.slide{width:1920px;height:1080px;transform-origin:0 0;transform:scale(var(--scale));position:absolute;inset:0}.slide>div{width:100%;height:100%}@media(max-width:1100px){.grid{grid-template-columns:1fr}} </style></head><body><h1>${firstTheme}–${lastTheme} Body-page Visual Audit</h1><p>每套主题同时审计卡片、表格与环形图，验证正文视觉语法，而非只比较封面。</p><main class="grid">${cards.join('')}</main><script>const resize=()=>document.querySelectorAll('.viewport').forEach(v=>v.style.setProperty('--scale',v.clientWidth/1920));addEventListener('resize',resize);resize();</script></body></html>`;
fs.mkdirSync(path.dirname(output), { recursive:true });
fs.writeFileSync(output, html);
console.log(`Rendered ${cards.length} theme audit cards: ${output}`);
