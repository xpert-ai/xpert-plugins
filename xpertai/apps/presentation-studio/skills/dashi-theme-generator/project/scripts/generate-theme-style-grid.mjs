#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { getExportBrowserPath } from './chrome-path.mjs';
import { GENERATED_THEME_DEFINITIONS } from '../src/components/themes/generated-theme-definitions.mjs';

const ORIGINAL_THEMES = [
  ['theme01', '轻拟态风', '产品介绍、企业汇报', '#e8f0f6', '#172233', '#3679ee'],
  ['theme02', '炫光紫绿风', '科技发布、AI', '#130923', '#f7f2ff', '#a855f7'],
  ['theme03', '深浅代码风', '技术方案、开发者', '#0b1a23', '#e8f3f4', '#55d6a7'],
  ['theme04', '玻璃糖果风', '消费产品、创意', '#f2e4f3', '#3c2745', '#e85ca9'],
  ['theme05', '色谱图表风', '数据报告、市场', '#f6f3ed', '#24221f', '#ef3b2c'],
  ['theme06', '深色图谱风', '战略分析、数据', '#061810', '#f4fff8', '#b7ef20'],
  ['theme07', '冷白调研风', '调研报告、白皮书', '#f4f6f2', '#1c2623', '#78d600'],
  ['theme08', '黑金实验风', '高端发布、品牌', '#160f0c', '#fff6e7', '#d7a83c'],
  ['theme09', '深蓝杂志风', '品牌故事、访谈', '#061f35', '#f0f7ff', '#4ba3ff'],
  ['theme10', '金色指数风', '金融投资、指数', '#1d1712', '#fff4dc', '#d0a12f'],
  ['theme11', '高能增长风', '增长复盘、商业', '#f3ece3', '#24201d', '#ff7043'],
  ['theme12', '声波霓虹风', '音乐娱乐、潮流', '#20102f', '#fff2ff', '#ff5b35'],
].map(([key, displayName, scenario, background, foreground, accent]) => ({
  key,
  displayName,
  scenario,
  tokens: { background, foreground, accent },
}));

const themes = [...ORIGINAL_THEMES, ...GENERATED_THEME_DEFINITIONS];
const outputArgIndex = process.argv.indexOf('--out');
const defaultOutput = fileURLToPath(new URL('../../assets/skill/theme-style-grid.png', import.meta.url));
const outputPath = path.resolve(outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : defaultOutput);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function luminance(hex) {
  const raw = String(hex).replace('#', '');
  const parts = raw.length === 3
    ? [...raw].map(part => Number.parseInt(part + part, 16))
    : [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)].map(part => Number.parseInt(part, 16));
  return (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000;
}

const cards = themes.map((theme, index) => {
  const { background, foreground, accent } = theme.tokens;
  const dark = luminance(background) < 130;
  const border = dark ? 'rgba(255,255,255,.08)' : 'rgba(17,24,39,.13)';
  const muted = dark ? 'rgba(255,255,255,.64)' : 'rgba(17,24,39,.60)';
  const summary = String(theme.scenario).split('、').slice(0, 2).join(' / ');
  return `<article class="card" style="--bg:${background};--fg:${foreground};--accent:${accent};--border:${border};--muted:${muted}">
    <div class="index">THEME ${String(index + 1).padStart(2, '0')}</div>
    <div class="card-copy">
      <h2>${escapeHtml(theme.displayName)}</h2>
      <p>${escapeHtml(summary)}</p>
      <span></span>
    </div>
  </article>`;
}).join('');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;background:#efede7;color:#121212}
  body{width:1440px;padding:54px 50px 50px;font-family:Inter,"SF Pro Display","PingFang SC","Microsoft YaHei",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  header{height:116px;display:flex;align-items:flex-start;justify-content:space-between}
  h1{margin:0;font-size:42px;line-height:1.08;letter-spacing:-1.7px;font-weight:850}
  header p{margin:10px 0 0;color:#696762;font-size:16px;font-weight:500}
  .system{padding-top:50px;color:#696762;font-size:15px;font-weight:650;letter-spacing:.03em}
  main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .card{height:156px;border-radius:11px;background:var(--bg);color:var(--fg);border:1px solid var(--border);padding:18px 19px 16px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
  .index{font:700 10px/1.1 "SFMono-Regular",Consolas,monospace;letter-spacing:.15em;color:var(--muted)}
  .card-copy h2{font-size:24px;line-height:1.15;letter-spacing:-.7px;margin:0 0 7px;font-weight:820}
  .card-copy p{font-size:11px;line-height:1.2;margin:0;color:var(--muted);font-weight:500}
  .card-copy span{display:block;width:60px;height:4px;background:var(--accent);margin-top:11px}
</style></head><body>
  <header><div><h1>Dashi PPT · ${themes.length} 套主题</h1><p>原 12 套独立页面库 + ${themes.length - 12} 套可重复生成主题</p></div><div class="system">EXTENDED THEME SYSTEM / 2026</div></header>
  <main>${cards}</main>
</body></html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ executablePath: getExportBrowserPath(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log(`Generated ${themes.length}-theme style grid: ${outputPath}`);
} finally {
  await browser.close();
}
