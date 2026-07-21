#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isSymbolOnlyText } from './layout-quality-text.mjs';

const args=parseArgs(process.argv.slice(2));
const project=path.resolve(args.project||'');
const themeKey=String(args.theme||'');
if(!args.project||!themeKey) throw new Error('--project and --theme are required');

const runtimePath=path.resolve(args.runtime||path.join(project,'dist/theme-runtime',`${themeKey}.module.mjs`));
const require=createRequire(path.join(project,'package.json'));
const esbuild=require('esbuild');
const {chromium}=require('playwright-core');
const {getExportBrowserPath}=await import(pathToFileURL(path.join(project,'scripts/chrome-path.mjs')).href);
const output=path.resolve(args.out||path.join('/tmp',`${themeKey}-layout-quality.json`));
const temp=await mkdtemp(path.join(os.tmpdir(),'dashi-layout-quality-'));
let browser;

try {
  const bundle=await esbuild.build({
    stdin:{
      contents:browserEntry(runtimePath),
      resolveDir:project,
      sourcefile:`${themeKey}-layout-quality-entry.jsx`,
      loader:'jsx',
    },
    absWorkingDir:project,
    bundle:true,
    format:'iife',
    platform:'browser',
    target:['chrome120'],
    nodePaths:[path.join(project,'node_modules')],
    write:false,
    logLevel:'silent',
  });
  await writeFile(path.join(temp,'bundle.js'),bundle.outputFiles[0].contents);
  await writeFile(path.join(temp,'index.html'),qualityHtml());

  browser=await chromium.launch({executablePath:getExportBrowserPath(),headless:true});
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(temp,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>Boolean(window.__dashiQuality?.pages?.length));
  const pages=await page.evaluate(()=>window.__dashiQuality.pages);
  const selected=selectPages(pages,args);
  const reports=[];
  const errors=[];

  for(const entry of selected) {
    const renderError=await page.evaluate(index=>window.__dashiQuality.render(index),entry.index);
    if(renderError) {
      const message=`${entry.key}: browser render failed: ${renderError}`;
      errors.push(message);
      reports.push({...entry,passed:false,errors:[message],metrics:null});
      continue;
    }
    await page.evaluate(()=>document.fonts?.ready);
    const metrics=await page.evaluate(analyzeSlide);
    const pageErrors=qualityErrors(entry,metrics);
    errors.push(...pageErrors);
    reports.push({...entry,passed:pageErrors.length===0,errors:pageErrors,metrics});
  }

  const result={
    theme:themeKey,
    designCanvas:{width:1920,height:1080},
    checkedPages:selected.length,
    totalPages:pages.length,
    passed:errors.length===0,
    thresholds:{maxLargeTextPx:220,maxOutsideRatio:.12,minSevereOverlapRatio:.35},
    errors,
    pages:reports,
  };
  await writeFile(output,`${JSON.stringify(result,null,2)}\n`);
  if(errors.length) {
    console.error(`Generated theme layout quality failed (${errors.length}) for ${themeKey}:`);
    for(const error of errors.slice(0,40)) console.error(`- ${error}`);
    if(errors.length>40) console.error(`- ... ${errors.length-40} more issue(s); see report`);
    console.error(`Report: ${output}`);
    process.exitCode=1;
  } else {
    console.log(`Generated theme layout quality passed: ${themeKey}, ${selected.length}/${pages.length} page(s)`);
    console.log(`Report: ${output}`);
  }
} finally {
  await browser?.close();
  await rm(temp,{recursive:true,force:true});
}

function browserEntry(runtimePath) {
  return `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {runtimePages} from ${JSON.stringify(runtimePath)};
    const host=document.getElementById('quality-slide');
    const root=createRoot(host);
    window.__dashiQuality={
      pages:runtimePages.map((page,index)=>({index,key:page.key,sourceTheme:page.sourceTheme||null,sourcePageKey:page.sourcePageKey||null,moduleOrigin:page.moduleOrigin||'reused',moduleFamily:page.moduleFamily||null,evidenceMode:page.evidenceMode||null})),
      render(index){
        const page=runtimePages[index];
        if(!page) return Promise.resolve('unknown page index '+index);
        try {
          root.render(React.createElement(page.Component,{...page.defaultProps,page:String(index+1).padStart(2,'0'),total:String(runtimePages.length)}));
          return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(null))));
        } catch(error) { return Promise.resolve(error?.stack||error?.message||String(error)); }
      },
    };
  `;
}

function qualityHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:960px;height:540px;overflow:hidden;background:#777}
    #viewport{position:relative;width:960px;height:540px;overflow:hidden;background:#777}
    #quality-slide{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;transform:scale(.5);transform-origin:0 0;background:transparent}
    *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
  </style></head><body><div id="viewport"><div id="quality-slide" data-deck-active="true"></div></div><script src="bundle.js"></script></body></html>`;
}

function analyzeSlide() {
  const slide=document.getElementById('quality-slide');
  const slideRect=slide.getBoundingClientRect();
  const decorativePattern=/decor|ornament|watermark|ghost|background|\bbg\b|texture|ambient/i;
  const effectiveOpacity=element=>{
    let opacity=1;
    for(let current=element;current&&current!==slide;current=current.parentElement) opacity*=Number.parseFloat(getComputedStyle(current).opacity)||0;
    return opacity;
  };
  const directText=element=>[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent||'').join(' ').replace(/\s+/g,' ').trim();
  const elements=[...slide.querySelectorAll('*')].map((element,index)=>{
    const text=directText(element);
    if(!text) return null;
    const style=getComputedStyle(element);
    const rect=element.getBoundingClientRect();
    if(style.display==='none'||style.visibility==='hidden'||rect.width<1||rect.height<1) return null;
    const opacity=effectiveOpacity(element);
    if(opacity<.08) return null;
    const classText=typeof element.className==='string'?element.className:'';
    const decorative=Boolean(element.closest('[aria-hidden="true"],[data-decorative="true"]'))||decorativePattern.test(classText);
    const left=(rect.left-slideRect.left)/slideRect.width;
    const top=(rect.top-slideRect.top)/slideRect.height;
    const width=rect.width/slideRect.width;
    const height=rect.height/slideRect.height;
    const outsideX=Math.max(0,-left)+Math.max(0,left+width-1);
    const outsideY=Math.max(0,-top)+Math.max(0,top+height-1);
    const outsideRatio=Math.min(1,(outsideX*height+outsideY*width)/Math.max(.000001,width*height));
    const fontSize=Number.parseFloat(style.fontSize)||0;
    const lineHeight=Number.parseFloat(style.lineHeight)||fontSize*1.2;
    const clipped=(element.scrollWidth>element.clientWidth+3||element.scrollHeight>element.clientHeight+3)&&['hidden','clip'].includes(style.overflow);
    return {index,tag:element.tagName.toLowerCase(),text:text.slice(0,120),fontSize,lineHeight,opacity,decorative,left,top,width,height,outsideRatio,clipped};
  }).filter(Boolean);
  return {elements,fontStatus:document.fonts?.status||'unknown'};
}

function qualityErrors(page,metrics) {
  const errors=[];
  const visible=metrics.elements.filter(item=>!item.decorative&&item.opacity>=.25);
  for(const item of visible) {
    const width=copyWidth(item.text);
    if(item.fontSize>220&&width>=3) errors.push(`${page.key}: oversized text "${brief(item.text)}" uses ${item.fontSize.toFixed(1)}px for ${width.toFixed(1)} visual units`);
    if(item.fontSize>=48&&width>3&&item.outsideRatio>.12) errors.push(`${page.key}: text "${brief(item.text)}" extends ${(item.outsideRatio*100).toFixed(1)}% outside the 1920×1080 canvas`);
    if(item.clipped&&item.fontSize>=14) errors.push(`${page.key}: text "${brief(item.text)}" is clipped by its own box`);
    if(item.lineHeight&&item.fontSize/item.lineHeight>1.35&&!isSymbolOnlyText(item.text)) errors.push(`${page.key}: text "${brief(item.text)}" has unsafe line-height ${item.lineHeight.toFixed(1)}px for ${item.fontSize.toFixed(1)}px type`);
  }
  for(let i=0;i<visible.length;i+=1) for(let j=i+1;j<visible.length;j+=1) {
    const a=visible[i];
    const b=visible[j];
    const maxFont=Math.max(a.fontSize,b.fontSize);
    const minFont=Math.max(1,Math.min(a.fontSize,b.fontSize));
    if(maxFont<96||maxFont/minFont<1.8) continue;
    const dominant=a.fontSize>=b.fontSize?a:b;
    if(copyWidth(dominant.text)<=3||/^[-+≈]?\d[\d,.%×+/-]*$/.test(dominant.text.trim())) continue;
    const overlap=intersectionRatio(a,b);
    if(overlap>.35) errors.push(`${page.key}: severe text overlap ${(overlap*100).toFixed(1)}% between "${brief(a.text)}" and "${brief(b.text)}"`);
  }
  return [...new Set(errors)].slice(0,16);
}

function intersectionRatio(a,b) {
  const left=Math.max(a.left,b.left);
  const top=Math.max(a.top,b.top);
  const right=Math.min(a.left+a.width,b.left+b.width);
  const bottom=Math.min(a.top+a.height,b.top+b.height);
  if(right<=left||bottom<=top) return 0;
  return (right-left)*(bottom-top)/Math.max(.000001,Math.min(a.width*a.height,b.width*b.height));
}

function copyWidth(value) {
  return Array.from(String(value||'')).reduce((sum,char)=>/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)?sum+1:/[A-Za-z0-9]/.test(char)?sum+.56:/\s/.test(char)?sum+.28:sum+.5,0);
}

function brief(value) {
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return text.length>24?`${text.slice(0,24)}…`:text;
}

function selectPages(pages,args) {
  const requested=String(args.pages||'').split(',').map(value=>value.trim()).filter(Boolean);
  let selected=requested.length?pages.filter(page=>requested.includes(page.key)||requested.includes(String(page.index+1))):pages;
  const max=Number(args['max-pages']);
  if(Number.isInteger(max)&&max>0) selected=selected.slice(0,max);
  if(!selected.length) throw new Error('No runtime pages matched the requested selection');
  return selected;
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
