#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { getExportBrowserPath } from './chrome-path.mjs';
import { resolveThemePaletteValidation } from './workflow/theme-palette-policy.mjs';
import { GENERATED_THEME_DEFINITIONS } from '../src/components/themes/generated-theme-definitions.mjs';

const root=path.resolve(import.meta.dirname,'..');
const requested=process.argv.includes('--theme')?process.argv[process.argv.indexOf('--theme')+1]:'';
const policy=resolveThemePaletteValidation(GENERATED_THEME_DEFINITIONS,requested);
if(policy.mode==='skip') {
  console.log(policy.message);
  process.exit(0);
}
const definitions=policy.definitions;

const browserPath=getExportBrowserPath();
if(!browserPath) throw new Error('No Chromium executable is available for rendered palette validation');
const browser=await chromium.launch({headless:true,executablePath:browserPath});
const errors=[];
try {
  for(const theme of definitions) {
    const runtimePath=path.join(root,'src/components/themes',theme.key,'runtime.jsx');
    const runtime=await import(`${pathToFileURL(runtimePath).href}?palette=${Date.now()}`);
    const indices=[0,8,16,17,Math.max(0,runtime.runtimePages.length-2)];
    const samples=[];
    for(const index of indices) {
      const pageRecord=runtime.runtimePages[index];
      const Component=pageRecord.Component;
      const markup=renderToStaticMarkup(<Component {...pageRecord.defaultProps}/>);
      const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
      await page.setContent(`<!doctype html><style>*{box-sizing:border-box}html,body,#root{margin:0;width:1280px;height:720px;overflow:hidden}</style><div id="root">${markup}</div>`,{waitUntil:'load'});
      const png=PNG.sync.read(await page.screenshot({type:'png'}));
      await page.close();
      samples.push(analyze(png,theme.tokens));
    }
    const backgroundShare=average(samples.map(sample=>sample.backgroundShare));
    const oppositeShare=average(samples.map(sample=>sample.oppositeShare));
    if(backgroundShare<0.28) errors.push(`${theme.key}: only ${(backgroundShare*100).toFixed(1)}% of rendered pixels follow the declared background ${theme.tokens.background}`);
    if(oppositeShare>0.38) errors.push(`${theme.key}: ${(oppositeShare*100).toFixed(1)}% of rendered pixels still use the opposite light/dark canvas`);
    console.log(`${theme.key}: background ${(backgroundShare*100).toFixed(1)}%, opposite-canvas ${(oppositeShare*100).toFixed(1)}%`);
  }
} finally {
  await browser.close();
}
if(errors.length) {
  console.error(`Generated theme palette validation failed (${errors.length}):`);
  errors.forEach(error=>console.error(`- ${error}`));
  process.exitCode=1;
} else console.log(`Generated theme palette validation passed: ${definitions.length} strict-palette theme(s).`);

function rgb(hex) {
  const value=hex.slice(1);
  return [0,2,4].map(index=>Number.parseInt(value.slice(index,index+2),16));
}
function distance(a,b) {
  return Math.sqrt(a.reduce((sum,value,index)=>sum+(value-b[index])**2,0));
}
function analyze(png,tokens) {
  const backgrounds=[tokens.background,tokens.canvasLight].filter(Boolean).map(rgb);
  const background=backgrounds[0];
  const light=(background[0]*299+background[1]*587+background[2]*114)/1000>128;
  let backgroundPixels=0;
  let oppositePixels=0;
  const total=png.width*png.height;
  for(let offset=0;offset<png.data.length;offset+=4) {
    const pixel=[png.data[offset],png.data[offset+1],png.data[offset+2]];
    if(backgrounds.some(canvas=>distance(pixel,canvas)<=32)) backgroundPixels+=1;
    const luminance=(pixel[0]*299+pixel[1]*587+pixel[2]*114)/1000;
    if(backgrounds.length===1&&(light?luminance<58:luminance>232)) oppositePixels+=1;
  }
  return {backgroundShare:backgroundPixels/total,oppositeShare:oppositePixels/total};
}
function average(values) {
  return values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
}
