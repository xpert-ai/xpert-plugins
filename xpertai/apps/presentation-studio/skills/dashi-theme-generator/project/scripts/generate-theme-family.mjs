#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_THEME_DEFINITIONS } from '../src/components/themes/generated-theme-definitions.mjs';

const root=path.resolve(import.meta.dirname,'..');
const themesDir=path.join(root,'src/components/themes');

for(const theme of GENERATED_THEME_DEFINITIONS) {
  validateTheme(theme);
  const dir=path.join(themesDir,theme.key);
  fs.mkdirSync(dir,{recursive:true});
  const css=themeCss(theme);
  write(dir,'theme.js',`export const definition = ${JSON.stringify(theme,null,2)};\n\nexport const themeCss = ${JSON.stringify(css)};\n`);
  write(dir,'theme.css',css);
  write(dir,'context.jsx',contextModule(theme));
  write(dir,'defaults.js',`export const themeDefaults = ${JSON.stringify(themeNarrative(theme),null,2)};\n`);
  write(dir,'controls.js',controlsModule(theme));
  write(dir,'charts.jsx',chartsModule(theme));
  write(dir,'media.jsx',mediaModule(theme));
  write(dir,'visuals.js',`export const visualPreset = ${JSON.stringify(visualPreset(theme),null,2)};\n`);
  write(dir,'helpers.jsx',helpersModule(theme));
  write(dir,'layouts.jsx',layoutsModule(theme));
  write(dir,'runtime.jsx',"import { createThemePages } from './layouts.jsx';\nexport const runtimePages = createThemePages();\n");
  const meta={key:theme.key,displayName:theme.displayName,label:theme.label,name:theme.name,scenario:theme.scenario,audience:theme.audience,mode:theme.mode};
  write(dir,'definition.json',`${JSON.stringify({...meta,tokens:theme.tokens,profile:theme.profile,recipe:theme.recipe,ownModules:theme.ownModules},null,2)}\n`);
}

console.log(`Generated independent authoring modules for ${GENERATED_THEME_DEFINITIONS.length} themes.`);

function write(dir,name,content) {
  fs.writeFileSync(path.join(dir,name),content);
}

function validateTheme(theme) {
  if(!theme?.key||!theme?.tokens||!theme?.profile||!theme?.recipe?.sources?.length) throw new Error('Generated theme requires key, tokens, profile, and recipe sources');
  if(!Array.isArray(theme.profile.vocabulary)||theme.profile.vocabulary.length<3) throw new Error(`${theme.key}: profile.vocabulary requires at least three evidence-backed terms`);
  if(!theme.profile.backgroundCss) throw new Error(`${theme.key}: profile.backgroundCss is required`);
}

function themeCss(theme) {
  const {tokens:t,profile:p,key}=theme;
  const v=visualPreset(theme);
  return `/* Theme-owned visual layer generated from the registered evidence profile. */\n.${key}-root{--theme-bg:${t.background};--theme-fg:${t.foreground};--theme-accent:${t.accent};--theme-secondary:${t.secondary};--theme-radius:${p.radius}px;font-family:${p.body};}\n.${key}-root .theme-frame{isolation:isolate;}\n.${key}-root .theme-heading{font-family:${p.heading};text-transform:${v.titleTransform};letter-spacing:${v.titleSpacing};max-width:${v.titleWidth}px;}\n.${key}-root .theme-eyebrow{font-family:${p.body};}\n.${key}-root .theme-surface{border-radius:${p.radius}px;${v.surfaceCss}}\n.${key}-root .theme-frame:before{content:"";position:absolute;pointer-events:none;z-index:0;${v.frameCss}}\n.${key}-root .theme-frame:after{content:${JSON.stringify(v.mark)};position:absolute;pointer-events:none;z-index:0;${v.markCss}}\n`;
}

function contextModule(theme) {
  return `import React from 'react';\nimport { definition, themeCss } from './theme.js';\n\nexport const ThemeContext = React.createContext(definition);\nexport const useTheme = () => React.useContext(ThemeContext);\n\nexport function ThemeProvider({ tokens, children }) {\n  const value = React.useMemo(() => ({ ...definition, tokens }), [tokens]);\n  return <ThemeContext.Provider value={value}><style>{themeCss}</style><div className="${theme.key}-root" data-frame={definition.profile.frame} style={{width:'100%',height:'100%',position:'relative'}}>{children}</div></ThemeContext.Provider>;\n}\n`;
}

function controlsModule(theme) {
  const densityOptions=['compact','balanced','spacious'].map(value=>({value,label:value==='compact'?'紧凑':value==='spacious'?'舒展':'平衡'}));
  return `export const themeControls = ${JSON.stringify([
    {key:'density',label:'信息密度',type:'select',default:theme.profile.density==='compact'?'compact':theme.profile.density==='spacious'?'spacious':'balanced',options:densityOptions,effect:{scope:'section',targets:['layout','surface'],minChangedRatio:.01,minRegions:2}},
    {key:'showOrnament',label:'主题装饰',type:'toggle',default:true,effect:{scope:'component',targets:['ornament'],minChangedRatio:.005,minRegions:1}},
  ],null,2)};\n`;
}

function chartsModule(theme) {
  const preset={style:theme.profile.chart,palette:[theme.tokens.accent,theme.tokens.secondary,theme.tokens.foreground],grid:theme.profile.chartGrid!==false,rounded:theme.profile.chartRounded===true};
  return `export const chartPreset = ${JSON.stringify(preset,null,2)};\n`;
}

function mediaModule(theme) {
  const preset={style:theme.profile.media,radius:theme.profile.radius,border:theme.profile.frame,caption:theme.profile.context};
  return `export const mediaPreset = ${JSON.stringify(preset,null,2)};\n`;
}

function visualPreset(theme) {
  const v=theme.profile.visual||{};
  return {
    grammar:theme.profile.frame,
    cardFlow:v.cardFlow||'grid',
    timeline:v.timeline||'horizontal',
    chart:theme.profile.chart,
    titleTransform:v.titleTransform||'none',
    titleSpacing:v.titleSpacing||'-.02em',
    titleWidth:Number(v.titleWidth)||900,
    surfaceCss:v.surfaceCss||'border:1px solid color-mix(in srgb,var(--theme-accent) 38%,transparent);',
    frameCss:v.frameCss||'',
    mark:v.mark||'',
    markCss:v.markCss||'right:48px;bottom:28px;color:var(--theme-accent);opacity:.72;',
    backgroundCss:theme.profile.backgroundCss,
  };
}

function helpersModule(theme) {
  return `import React from 'react';\nimport { useTheme } from './context.jsx';\n\nexport function ThemeDecor({ show=true }) {\n  const theme = useTheme();\n  if (!show) return null;\n  return <div aria-hidden="true" style={{position:'absolute',inset:22,pointerEvents:'none',zIndex:8,border:'1px solid color-mix(in srgb, currentColor 18%, transparent)',color:theme.tokens.accent,opacity:.28}} />;\n}\n\nexport const themeHelpers = ${JSON.stringify({ornament:theme.profile.ornament,context:theme.profile.context,density:theme.profile.density},null,2)};\n`;
}

function layoutsModule(theme) {
  const sourceThemes=theme.recipe.sources;
  const ownModules=theme.ownModules;
  const layoutPreset={coverMode:'feature',cardMode:'editorial',chartScale:1,sectionRule:theme.profile.ornament,...theme.profile.layoutPreset};
  return [
    `import { createComposedThemeRuntime } from '../generated-theme-baseline-adapter.jsx';`,
    ...(ownModules?[`import { signaturePages } from '${ownModules.module}';`]:[]),
    ...sourceThemes.map((source,index)=>`import { runtimePages as sourcePages${index} } from '../../../../dist/theme-runtime/${source}.module.mjs';`),
    `import { definition } from './theme.js';`,
    `import { ThemeProvider } from './context.jsx';`,
    `import { themeDefaults } from './defaults.js';`,
    `import { themeControls } from './controls.js';`,
    `import { chartPreset } from './charts.jsx';`,
    `import { mediaPreset } from './media.jsx';`,
    `import { visualPreset } from './visuals.js';`,
    `import { ThemeDecor, themeHelpers } from './helpers.jsx';`,
    ``,
    `export const baselineTheme = '${sourceThemes[0]}';`,
    `export const sourceThemes = ${JSON.stringify(sourceThemes)};`,
    `export const layoutPreset = ${JSON.stringify(layoutPreset,null,2)};`,
    ``,
    `export function createThemePages() {`,
    `  return createComposedThemeRuntime(definition, [${[...(ownModules?[`{themeKey:definition.key,pages:signaturePages,kind:'owned'}`]:[]),...sourceThemes.map((source,index)=>`{themeKey:'${source}',pages:sourcePages${index}}`)].join(', ')}], { ThemeProvider, ThemeDecor, themeDefaults, themeControls, chartPreset, mediaPreset, visualPreset, themeHelpers, layoutPreset });`,
    `}`,
    ``,
  ].join('\n');
}

function themeNarrative(theme) {
  const subject=theme.scenario.split('、')[0];
  const audience=theme.audience.split('、')[0];
  const pillars=theme.profile.vocabulary;
  return {
    cover:{kicker:`${theme.profile.context.toUpperCase()} / 2026`,title:theme.displayName,subtitle:`以${theme.displayName}讲清${subject}的关键问题与行动路径`},
    statement:{title:`为${audience}建立一套可执行的${subject}框架`,subtitle:`围绕${pillars.join('、')}组织事实、判断与下一步。`},
    cards:{title:`${subject}的三个关键支点`,items:pillars.slice(0,3).map((title,index)=>({title,body:`围绕第 ${index+1} 个关键议题形成明确证据与行动。`}))},
    metrics:{title:`用核心指标校准${subject}进展`},
    closing:{title:'把共识转化为下一步',subtitle:`面向${audience}的讨论与行动确认`},
  };
}
