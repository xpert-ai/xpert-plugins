import React from 'react';
import { composeThemeModules, moduleFamily } from './generated-theme-module-composer.mjs';

const COPY_KEYS = /^(title|headline|heading|subhead|subtitle|lede|lead|intro|body|copy|text|note|caption|description|desc|quote|closing|statement|insight|takeaway|label|sub|cn|en|kicker|eyebrow|name|action|summary|message|task|outcome|question|answer|result|objective|detail|valueLabel|masthead|attribution|signature|serial|reel|who|code|titleTail)$/i;
const PROTECTED = /^(https?:|data:|assets\/|\.\/|#(?:[0-9a-f]{3}){1,2}$)|\.(?:png|jpe?g|webp|gif|svg|mp4|webm)$/i;
const PROTECTED_KEYS = /(?:^|_)(id|key|src|href|url|image|images|media|video|poster|icon|logo|font|family|fit|mode|layout|align|side|position|placement|variant|tone|scene|pattern|shape|direction|orientation|chartType|backgroundMode|scrim|page|total|index|count)$/i;
const ENUM_VALUES = new Set('left right top bottom center centered horizontal vertical grid list cards columns rows split full cover contain auto light dark warm cool primary secondary accent green blue red pink yellow violet lime white black gray grey mono color line bar bars area pie donut radar funnel waterfall scatter table chart image media glass glow gradient solid outline rounded square circle number arabic roman normal alternate asc desc ascending descending true false none tech dawn dusk moving static feature editorial panel paper map flow steps stage monthly yearly'.split(' '));
const SOURCE_DEMO_TERMS = /AI Capital|OpenAI|xAI|CoreWeave|Anthropic|Databricks|SoundWave|声浪/i;

function themeLexicon(definition) {
  const subjects=definition.scenario.split('、');
  const audiences=definition.audience.split('、');
  const pillars=definition.profile?.vocabulary?.length
    ? definition.profile.vocabulary
    : ['识别机会','建立共识','验证路径','持续迭代'];
  return {
    subjects,audiences,pillars,
    lenses:['现状','约束','机会','路径','信号','证据','影响','节奏','边界','反馈','样本','趋势'],
    verbs:['识别','比较','验证','连接','量化','复盘','推进','校准','拆解','追踪','重构','沉淀'],
    colors:[definition.tokens.accent,definition.tokens.secondary,definition.tokens.foreground],
  };
}

function stableIndex(value,size) {
  let hash=2166136261;
  for(const char of String(value)) hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return (hash>>>0)%size;
}

function replacement(key,index,lexicon,pageIndex,source='') {
  const seed=`${key}:${source}:${pageIndex}:${index}`;
  const offset=stableIndex(seed,97);
  const pillar=lexicon.pillars[(index+pageIndex+offset)%lexicon.pillars.length];
  const subject=lexicon.subjects[(pageIndex+offset)%lexicon.subjects.length];
  const audience=lexicon.audiences[(pageIndex+index+offset)%lexicon.audiences.length];
  const next=lexicon.pillars[(index+pageIndex+offset+1)%lexicon.pillars.length];
  const lens=lexicon.lenses[(pageIndex+index+offset)%lexicon.lenses.length];
  const verb=lexicon.verbs[(pageIndex+index*2+offset)%lexicon.verbs.length];
  const longForm=[
    `从${lens}切入${subject}，以${pillar}${verb}关键证据，为${audience}形成可执行的下一步。`,
    `${subject}正在由${pillar}走向${next}，需要通过${lens}${verb}现状、约束与机会。`,
    `以${pillar}校准${subject}的${lens}，再用${next}检验结果能否持续。`,
    `围绕${subject}${verb}${pillar}与${next}，让${lens}判断建立在具体事实之上。`,
    `${audience}可从${lens}观察${subject}，用${pillar}解释变化，并以${next}推进响应。`,
    `${subject}的关键不只是${pillar}，还要持续${verb}${next}带来的${lens}反馈。`,
  ][offset%6];
  if(/^(title|headline|heading|statement)$/i.test(key)) return `${subject} · ${verb}${pillar}`;
  if(/^(subhead|subtitle|lede|lead|summary|takeaway|insight)$/i.test(key)) return longForm;
  if(/^(body|copy|text|note|caption|description|desc|quote|closing|message|action)$/i.test(key)) return longForm;
  if(/^(kicker|eyebrow)$/i.test(key)) return `${String(pageIndex+1).padStart(2,'0')} / ${subject}`;
  if(key==='en') return `${pillar} / ${String(pageIndex+1).padStart(2,'0')}`.toUpperCase();
  if(key==='name') return `${lens}${index+1}`;
  if(key==='signature') return 'END';
  if(/^(label|cn)$/i.test(key)) return pillar;
  if(/brand|project|series|topic|subject|category|sector|company|person|role|tag/i.test(key)) return `${lens}${pillar}`;
  const length=String(source).length;
  if(length<=10) return pillar;
  if(length<=20) return `${subject} · ${pillar}`;
  return longForm;
}

function copyWidth(value) {
  return Array.from(String(value||'')).reduce((sum,char)=>{
    if(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)) return sum+1;
    if(/\s/.test(char)) return sum+.28;
    if(/[A-Za-z0-9]/.test(char)) return sum+.56;
    return sum+.5;
  },0);
}

function fitReplacement(candidate,source) {
  const budget=Math.max(.56,copyWidth(source));
  if(copyWidth(candidate)<=budget) return candidate;
  let output='';
  for(const char of Array.from(String(candidate||''))) {
    if(copyWidth(output+char)>budget) break;
    output+=char;
  }
  return output||source;
}

function isVisibleCopy(value,key) {
  if(PROTECTED_KEYS.test(key)||PROTECTED.test(value)) return false;
  const normalized=value.trim().toLowerCase();
  if(!normalized||ENUM_VALUES.has(normalized)) return false;
  if(/^[-+]?\d+(?:\.\d+)?%?$/.test(normalized)||/^q[1-4]$/.test(normalized)||/^20\d{2}$/.test(normalized)) return false;
  return COPY_KEYS.test(key)||/brand|project|series|topic|subject|category|sector|company|person|role|tag/i.test(key);
}

function rethemeValue(value,key,lexicon,pageIndex,index=0) {
  if(Array.isArray(value)) return value.map((item,i)=>rethemeValue(item,key,lexicon,pageIndex,i));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([child,v])=>[child,rethemeValue(v,child,lexicon,pageIndex,index)]));
  if(typeof value==='string'&&/^#[0-9a-f]{3,8}$/i.test(value)&&/(accent|color|palette|tone)/i.test(key)) return lexicon.colors[index%lexicon.colors.length];
  if(typeof value==='string'&&SOURCE_DEMO_TERMS.test(value)&&!PROTECTED_KEYS.test(key)&&!PROTECTED.test(value)) {
    return fitReplacement(replacement('body',index,lexicon,pageIndex,value),value);
  }
  if(typeof value!=='string'||!isVisibleCopy(value,key)) return value;
  return fitReplacement(replacement(key,index,lexicon,pageIndex,value) ?? value,value);
}

function rethemeDefaults(defaults,definition,pageIndex) {
  const lexicon=themeLexicon(definition);
  const themed=Object.fromEntries(Object.entries(defaults||{}).map(([key,value])=>[key,rethemeValue(value,key,lexicon,pageIndex)]));
  if(Object.prototype.hasOwnProperty.call(themed,'showQuoteMark')) themed.showQuoteMark=false;
  return themed;
}

function rethemeControls(controls,definition) {
  const colors=[definition.tokens.accent,definition.tokens.secondary,definition.tokens.foreground];
  return (controls||[]).map(control=>{
    if(control.display==='color'||/(accent|color|palette)/i.test(control.key||'')) {
      return {...control,default:Array.isArray(control.default)?colors:colors[0],options:Array.isArray(control.default)?[colors]:colors};
    }
    return control;
  });
}

function structuralLabel(page,definition) {
  const slot=String(page.slot||'').toLowerCase();
  const roles=new Set(page.roles||[]);
  let type='信息结构';
  if(slot.includes('cover')) type='封面';
  else if(/closing|conclusion|endcap|appendix/.test(slot)) type='结论与收束';
  else if(/chapter|section|transition/.test(slot)||roles.has('transition')) type='章节过渡';
  else if(/timeline|roadmap|gantt|milestone/.test(slot)||roles.has('timeline')) type='时间与路径';
  else if(/heatmap|matrix|quadrant|swot|mekko/.test(slot)||roles.has('matrix')) type='矩阵与分层';
  else if(/donut|pie|radar|gauge|arc|polar|waffle/.test(slot)) type='比例与能力图';
  else if(/bar|rank|lollipop|bullet|slope|waterfall|column/.test(slot)||roles.has('ranking')) type='排行与趋势图';
  else if(/network|graph|flow|map|constellation/.test(slot)||roles.has('relationship')) type='关系与网络';
  else if(/compare|versus|split|dumbbell/.test(slot)||roles.has('comparison')) type='对比分析';
  else if(/media|image|hero|gallery|collage|triptych|filmstrip|case|spotlight|editorial/.test(slot)||roles.has('image')||roles.has('media')) type='图文与案例';
  else if(/metric|stat|kpi|score|number|dial/.test(slot)||roles.has('metrics')) type='指标总览';
  else if(/table|list|agenda|contents|risk/.test(slot)||roles.has('table')) type='清单与表格';
  else if(/quote|statement|claim/.test(slot)||roles.has('statement')) type='观点与引语';
  else if(/stack|stream|area|funnel|distribution/.test(slot)||roles.has('distribution')) type='构成与分布';
  return `${definition.displayName} · ${type}`;
}

function smoothThemeBackground(definition) {
  const {tokens:t}=definition;
  return definition.profile?.backgroundCss
    || `radial-gradient(ellipse at 86% 12%,${t.accent}20,transparent 44%),linear-gradient(145deg,transparent 52%,${t.secondary}10)`;
}

function themeBridgeCss(definition) {
  const {tokens:t,profile:p,key}=definition;
  const rgb=(t.background.match(/[0-9a-f]{2}/gi)||[]).map(value=>Number.parseInt(value,16));
  const darkBackground=rgb.length===3&&(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000<118;
  const smoothBackground=smoothThemeBackground(definition);
  const strictPalette=p.paletteMode==='strict'?`
.${key}-baseline :is(div,section,main,article,aside,header,footer){background-color:transparent!important;background-image:none!important;box-shadow:none!important;text-shadow:none!important;filter:none!important;}
.${key}-baseline :is([class*="slide"],[class*="page"],[class*="canvas"],[class*="screen"],[class*="stage"]){background:${t.background}!important;background-image:none!important;}
.${key}-baseline :is([class*="card"],[class*="panel"],[class*="tile"],[class*="cell"]){background:color-mix(in srgb,${t.background} 94%,white)!important;border-color:${t.secondary}!important;box-shadow:none!important;}
.${key}-baseline :is(h1,h2,h3,h4,h5,p,li,td,th,strong,small,label){color:${t.foreground}!important;text-shadow:none!important;}
.${key}-baseline :is([class*="accent"],[class*="active"],[class*="highlight"],[class*="value"],[class*="metric"],[class*="number"],[class*="kicker"],[class*="eyebrow"]){color:${t.accent}!important;-webkit-text-fill-color:${t.accent}!important;}
.${key}-baseline :is(h1,h2,h3) :is(span,strong,em),.${key}-baseline :is([class*="title"],[class*="headline"]) :is(span,strong,em){color:${t.accent}!important;-webkit-text-fill-color:${t.accent}!important;}
.${key}-baseline svg :is([class*="bar"],[class*="line"],[class*="area"],[class*="series"],[class*="data"],[class*="chart"])[fill]:not([fill="none"]){fill:${t.accent}!important;filter:none!important;}
.${key}-baseline svg :is([class*="axis"],[class*="grid"],[class*="line"],[class*="series"],[class*="data"],[class*="chart"])[stroke]:not([stroke="none"]){stroke:${t.secondary}!important;filter:none!important;}
`:'';
  return `
.${key}-baseline{--dashi-target-bg:${t.background};--dashi-target-fg:${t.foreground};--dashi-target-accent:${t.accent};--dashi-target-secondary:${t.secondary};width:100%;height:100%;position:relative;overflow:hidden;background:${t.background};color:${t.foreground};}
.${key}-baseline>:not(style){background-color:${t.background}!important;color:${t.foreground}!important;background-image:${smoothBackground}!important;background-repeat:no-repeat!important;background-size:cover!important;}
.${key}-baseline>:not(style)>[class*="bg"]{background-color:transparent!important;background-image:none!important;}
.${key}-baseline :is(h1,h2,h3,h4,p,li,td,th,[class*="title"],[class*="headline"],[class*="display"],[class*="body"],[class*="copy"],[class*="note"]){color:${t.foreground}!important;}
${darkBackground?`.${key}-baseline p{opacity:.86!important;}`:''}
.${key}-baseline :is([class*="subtitle"],[class*="subhead"],[class*="lede"],[class*="description"],[class*="summary"]){color:color-mix(in srgb,${t.foreground} 82%,${t.accent})!important;opacity:1!important;}
.${key}-baseline :is(h1,h2,h3,[class*="title"],[class*="headline"],[class*="display"]){font-family:${p.heading}!important;}
.${key}-baseline :is(p,li,td,th,[class*="body"],[class*="copy"],[class*="note"]){font-family:${p.body}!important;}
.${key}-baseline :is([class*="kicker"],[class*="eyebrow"],[class*="metric"],[class*="value"],[class*="accent"]){color:${t.accent}!important;}
.${key}-baseline :is([class*="card"],[class*="panel"],[class*="tile"]){background-color:color-mix(in srgb,${t.background} 90%,${t.foreground})!important;border-color:color-mix(in srgb,${t.accent} 46%,transparent)!important;}
.${key}-baseline :is([class*="tag"],[class*="chip"],[class*="badge"],[class*="kicker"]){border-radius:${Math.min(p.radius,18)}px!important;}
.${key}-baseline .pulse-big__num b{font-size:220px!important;line-height:1!important;}
.${key}-baseline:after{content:"${p.ornament.toUpperCase()}";position:absolute;right:34px;bottom:24px;z-index:30;color:${t.accent};font:700 12px ${p.body};letter-spacing:.18em;pointer-events:none;opacity:.75;}
${strictPalette}
`;
}

export function createComposedThemeRuntime(definition,libraries,modules={}) {
  return composeThemeModules(definition,libraries).map((entry,index)=>{
    const {page:basePage,sourceTheme,kind}=entry;
    const defaultProps=kind==='owned'?basePage.defaultProps:rethemeDefaults(basePage.defaultProps,definition,index);
    const pageNumber=index+1;
    return {
      ...basePage,
      key:`${definition.key}_page${String(pageNumber).padStart(3,'0')}`,
      themeKey:definition.key,
      pageNumber,
      layout:`${definition.key.toUpperCase()}-${String(pageNumber).padStart(3,'0')}`,
      slot:`${basePage.slot}-${sourceTheme}-${String(basePage.pageNumber||index+1).padStart(3,'0')}`,
      label:kind==='owned'?basePage.label:structuralLabel(basePage,definition),
      sourceTheme,
      sourcePageKey:basePage.key,
      moduleFamily:moduleFamily(basePage),
      ...(kind==='owned'?{
        moduleOrigin:'owned',
        moduleStrategy:basePage.moduleStrategy||'new',
        archetypeId:basePage.archetypeId,
        evidenceMode:basePage.evidenceMode||'observed',
        evidenceRefs:basePage.evidenceRefs,
        derivedFromRules:basePage.derivedFromRules,
        anchorModuleRefs:basePage.anchorModuleRefs,
        stylePrimitiveRefs:basePage.stylePrimitiveRefs,
        derivationReason:basePage.derivationReason,
        styleSignals:basePage.styleSignals,
        sourceContract:basePage.sourceContract,
      }:{}),
      defaultProps,
      controls:rethemeControls(basePage.controls,definition),
      Component:props=>{
        const Component=basePage.Component;
        const content=kind==='owned'
          ? <Component {...defaultProps} {...props}/>
          : <><style>{themeBridgeCss(definition)}</style><div className={`${definition.key}-baseline`}><Component {...defaultProps} {...props}/></div></>;
        if(!modules.ThemeProvider) return content;
        const Provider=modules.ThemeProvider;
        return <Provider tokens={{...definition.tokens,profile:definition.profile}}>{content}</Provider>;
      },
    };
  });
}

export function createBaselineThemeRuntime(definition,basePages,modules={}) {
  const sourceTheme=definition.baselineTheme||definition.recipe?.sources?.[0];
  return createComposedThemeRuntime({...definition,recipe:{pageCount:definition.recipe?.pageCount||84,sources:[sourceTheme]}},[{themeKey:sourceTheme,pages:basePages}],modules);
}

export const generatedThemeQualityInternals={rethemeDefaults,themeBridgeCss,copyWidth,fitReplacement};
