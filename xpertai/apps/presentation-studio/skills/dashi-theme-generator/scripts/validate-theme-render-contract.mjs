#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args=parseArgs(process.argv.slice(2));
const project=path.resolve(args.project||'');
const themeKey=String(args.theme||'');
if(!args.project||!themeKey) throw new Error('--project and --theme are required');

const require=createRequire(path.join(project,'package.json'));
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {chromium}=require('playwright-core');
const {PNG}=require('pngjs');
const {getExportBrowserPath}=await import(pathToFileURL(path.join(project,'scripts/chrome-path.mjs')).href);
const runtimePath=path.resolve(args.runtime||path.join(project,'dist/theme-runtime',`${themeKey}.module.mjs`));
const runtime=await import(`${pathToFileURL(runtimePath).href}?renderContract=${Date.now()}`);
const pages=(runtime.runtimePages||[]).filter(page=>page.moduleOrigin==='owned'||page.sourceTheme===themeKey);
if(!pages.length) throw new Error(`${themeKey} has no built theme-owned runtime pages; build the generated runtime first`);

const output=path.resolve(args.out||path.join('/tmp',`${themeKey}-render-contract.json`));
const errors=[];
const pageReports=[];
const browser=await chromium.launch({executablePath:getExportBrowserPath(),headless:true});

try {
  const browserPage=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  for(const runtimePage of pages) {
    const report=await validatePage(runtimePage,browserPage,{React,renderToStaticMarkup,PNG,errors});
    pageReports.push(report);
  }
} finally {
  await browser.close();
}

const result={
  theme:themeKey,
  designCanvas:{width:1920,height:1080},
  ownedPages:pages.length,
  passed:errors.length===0,
  errors,
  pages:pageReports,
};
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,`${JSON.stringify(result,null,2)}\n`);

if(errors.length) {
  console.error(`Theme render contract failed (${errors.length}):`);
  for(const error of errors) console.error(`- ${error}`);
  console.error(`Report: ${output}`);
  process.exitCode=1;
} else {
  console.log(`Theme render contract passed: ${themeKey}, ${pages.length} owned page(s)`);
  console.log(`Report: ${output}`);
}

async function validatePage(runtimePage,browserPage,tools) {
  const {React,renderToStaticMarkup,PNG,errors}=tools;
  const pageId=runtimePage.key||runtimePage.sourcePageKey||runtimePage.slot;
  const contract=runtimePage.canvasContract;
  validateCanvasDeclaration(pageId,contract,errors);

  let baseA;
  let baseB;
  try {
    const markup=render(runtimePage,runtimePage.defaultProps,React,renderToStaticMarkup);
    baseA=await capture(browserPage,markup,'#010203',PNG);
    baseB=await capture(browserPage,markup,'#fefd01',PNG);
  } catch(error) {
    errors.push(`${pageId}: default render failed: ${error.message}`);
    return {key:pageId,passed:false,error:error.message,controls:[]};
  }

  const leak=diffStats(baseA.png,baseB.png,18);
  if(leak.ratio>0.01) errors.push(`${pageId}: ${(leak.ratio*100).toFixed(2)}% of the final canvas is transparent or uncovered (max 1%)`);
  if(baseA.root.widthRatio<0.99||baseA.root.heightRatio<0.99) {
    errors.push(`${pageId}: largest visible root covers ${(baseA.root.widthRatio*100).toFixed(1)}% × ${(baseA.root.heightRatio*100).toFixed(1)}% of the 1920×1080 canvas`);
  }

  const controls=[];
  for(const control of (runtimePage.controls||[]).filter(isVisualControl)) {
    const controlReport=await validateControl(runtimePage,control,browserPage,tools);
    controls.push(controlReport);
  }

  return {
    key:pageId,
    archetypeId:runtimePage.archetypeId||null,
    evidenceMode:runtimePage.evidenceMode||'observed',
    derivedFromRules:runtimePage.derivedFromRules||[],
    anchorModuleRefs:runtimePage.anchorModuleRefs||[],
    canvasContract:contract||null,
    canvasLeakRatio:round(leak.ratio),
    largestRootWidthRatio:round(baseA.root.widthRatio),
    largestRootHeightRatio:round(baseA.root.heightRatio),
    controls,
    passed:leak.ratio<=0.01&&baseA.root.widthRatio>=0.99&&baseA.root.heightRatio>=0.99&&controls.every(item=>item.passed),
  };
}

async function validateControl(runtimePage,control,browserPage,tools) {
  const {React,renderToStaticMarkup,PNG,errors}=tools;
  const pageId=runtimePage.key||runtimePage.sourcePageKey||runtimePage.slot;
  const controlId=`${pageId}.${control.key}`;
  const classification=classifyControl(control);
  const effect=control.effect;
  validateEffectDeclaration(controlId,effect,classification,errors);

  const baseProps=reachableProps(runtimePage.defaultProps||{},runtimePage.controls||[],control);
  const current=baseProps[control.key]??control.default;
  const alternative=alternateValue(control,current);
  if(alternative===undefined) {
    errors.push(`${controlId}: no alternate value is available for visual validation`);
    return {key:control.key,passed:false,reason:'no-alternate-value'};
  }

  let baseline;
  let changed;
  try {
    baseline=await capture(browserPage,render(runtimePage,{...baseProps,[control.key]:current},React,renderToStaticMarkup),'#010203',PNG);
    changed=await capture(browserPage,render(runtimePage,{...baseProps,[control.key]:alternative},React,renderToStaticMarkup),'#010203',PNG);
  } catch(error) {
    errors.push(`${controlId}: control render failed: ${error.message}`);
    return {key:control.key,passed:false,reason:'render-failed',error:error.message};
  }

  const diff=diffStats(baseline.png,changed.png,24);
  const declaredRatio=finite(effect?.minChangedRatio);
  const declaredRegions=finite(effect?.minRegions);
  const minChangedRatio=Math.max(classification.minChangedRatio,declaredRatio??0);
  const minRegions=Math.max(classification.minRegions,declaredRegions??0);
  const passed=Boolean(effect)&&diff.ratio>=minChangedRatio&&diff.regions>=minRegions;
  if(diff.ratio<minChangedRatio) errors.push(`${controlId}: changed ${(diff.ratio*100).toFixed(2)}% of pixels; requires at least ${(minChangedRatio*100).toFixed(2)}%`);
  if(diff.regions<minRegions) errors.push(`${controlId}: changed ${diff.regions} of 12 regions; requires at least ${minRegions}`);

  return {
    key:control.key,
    type:control.type,
    classification:classification.kind,
    effect:effect||null,
    from:current,
    to:alternative,
    changedRatio:round(diff.ratio),
    changedPixels:diff.changedPixels,
    changedRegions:diff.regions,
    requiredRatio:minChangedRatio,
    requiredRegions:minRegions,
    passed,
  };
}

function render(runtimePage,props,React,renderToStaticMarkup) {
  return renderToStaticMarkup(React.createElement(runtimePage.Component,props));
}

async function capture(page,markup,sentinel,PNG) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:960px;height:540px;overflow:hidden;background:${sentinel}}
    .capture{position:relative;width:960px;height:540px;overflow:hidden;background:${sentinel}}
    .quality-slide{position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(.5);transform-origin:0 0;background:transparent;overflow:hidden}
  </style></head><body><div class="capture"><div class="quality-slide">${markup}</div></div><style>
    *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
  </style></body></html>`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts?.ready);
  const root=await page.evaluate(()=>{
    const slide=document.querySelector('.quality-slide');
    const slideRect=slide.getBoundingClientRect();
    const candidates=[...slide.children].map(element=>element.getBoundingClientRect()).filter(rect=>rect.width>1&&rect.height>1);
    const largest=candidates.sort((a,b)=>b.width*b.height-a.width*a.height)[0]||{width:0,height:0};
    return {widthRatio:largest.width/slideRect.width,heightRatio:largest.height/slideRect.height};
  });
  const buffer=await page.locator('.capture').screenshot({animations:'disabled'});
  return {png:PNG.sync.read(buffer),root};
}

function validateCanvasDeclaration(pageId,contract,errors) {
  if(!contract) {
    errors.push(`${pageId}: missing canvasContract`);
    return;
  }
  if(contract.designWidth!==1920||contract.designHeight!==1080) errors.push(`${pageId}: canvasContract must use 1920×1080 design coordinates`);
  if(contract.rootMode!=='fill-parent') errors.push(`${pageId}: canvasContract.rootMode must be fill-parent`);
  if(contract.backgroundMode!=='opaque') errors.push(`${pageId}: canvasContract.backgroundMode must be opaque`);
}

function validateEffectDeclaration(controlId,effect,classification,errors) {
  if(!effect) {
    errors.push(`${controlId}: missing effect declaration`);
    return;
  }
  if(!['global','section','component'].includes(effect.scope)) errors.push(`${controlId}: effect.scope must be global, section, or component`);
  if(!Array.isArray(effect.targets)||!effect.targets.length) errors.push(`${controlId}: effect.targets must declare visible semantic targets`);
  if(classification.requiresGlobal&&effect.scope!=='global') errors.push(`${controlId}: theme/background/accent controls must use global effect scope`);
  if((finite(effect.minChangedRatio)??0)<classification.minChangedRatio) errors.push(`${controlId}: declared minChangedRatio is below the ${classification.kind} floor`);
  if((finite(effect.minRegions)??0)<classification.minRegions) errors.push(`${controlId}: declared minRegions is below the ${classification.kind} floor`);
}

function classifyControl(control) {
  const text=`${control.key||''} ${control.label||''}`.toLowerCase();
  if(/background|canvas|tone|明暗|背景|画布/.test(text)) return {kind:'canvas',minChangedRatio:.15,minRegions:8,requiresGlobal:true};
  if(/theme.?color|accent|palette|primary|secondary|主题色|强调色|主色|辅色|配色/.test(text)) return {kind:'palette',minChangedRatio:.05,minRegions:4,requiresGlobal:true};
  if(/layout|density|direction|side|position|align|count|column|row|focus|index|布局|密度|方向|数量|列|行|焦点|强调项/.test(text)) return {kind:'structure',minChangedRatio:.01,minRegions:2,requiresGlobal:false};
  return {kind:'component',minChangedRatio:.005,minRegions:1,requiresGlobal:false};
}

function reachableProps(defaultProps,controls,target) {
  const props={...defaultProps};
  if(target.dependsOn) {
    props[target.dependsOn]=target.dependsOnValue??target.dependsOnValues?.[0]??true;
  }
  if(typeof target.showIf==='function'&&!target.showIf(props)) {
    const booleans=[...Object.entries(props),...controls.map(control=>[control.key,control.default])].filter(([,value])=>typeof value==='boolean');
    for(const [key,value] of booleans) {
      const candidate={...props,[key]:!value};
      if(target.showIf(candidate)) return candidate;
    }
  }
  return props;
}

function alternateValue(control,current) {
  const type=String(control.type||'').toLowerCase();
  if(type==='toggle'||type==='boolean'||typeof current==='boolean') return !Boolean(current);
  if(type==='color'&&typeof current==='string') return current.toLowerCase()==='#ffffff'?'#111111':'#ffffff';
  const options=(control.options||[]).map(optionValue);
  if(options.length) return options.find(value=>JSON.stringify(value)!==JSON.stringify(current));
  if(['range','slider','number'].includes(type)) {
    const min=finite(control.min);
    const max=finite(control.max);
    if(max!=null&&Number(current)!==max) return max;
    if(min!=null&&Number(current)!==min) return min;
  }
  return undefined;
}

function optionValue(option) {
  if(option&&typeof option==='object'&&!Array.isArray(option)) return option.value??option.key??option.id;
  return option;
}

function isVisualControl(control) {
  return ['toggle','boolean','select','radio','enum','range','slider','number','color','palette'].includes(String(control?.type||'').toLowerCase());
}

function diffStats(a,b,threshold) {
  if(a.width!==b.width||a.height!==b.height) throw new Error('Screenshot dimensions differ');
  const tileColumns=4;
  const tileRows=3;
  const tileChanged=new Array(tileColumns*tileRows).fill(0);
  const tileTotals=new Array(tileColumns*tileRows).fill(0);
  let changedPixels=0;
  for(let y=0;y<a.height;y+=1) {
    for(let x=0;x<a.width;x+=1) {
      const offset=(y*a.width+x)*4;
      const delta=Math.abs(a.data[offset]-b.data[offset])+Math.abs(a.data[offset+1]-b.data[offset+1])+Math.abs(a.data[offset+2]-b.data[offset+2]);
      const tileX=Math.min(tileColumns-1,Math.floor(x/a.width*tileColumns));
      const tileY=Math.min(tileRows-1,Math.floor(y/a.height*tileRows));
      const tile=tileY*tileColumns+tileX;
      tileTotals[tile]+=1;
      if(delta>threshold) {
        changedPixels+=1;
        tileChanged[tile]+=1;
      }
    }
  }
  return {
    changedPixels,
    ratio:changedPixels/(a.width*a.height),
    regions:tileChanged.filter((count,index)=>count/tileTotals[index]>=.002).length,
  };
}

function finite(value) {
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function round(value) {
  return Number(value.toFixed(6));
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
