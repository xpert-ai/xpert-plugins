#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { resolveThemeGenerationPolicy, THEME_GENERATION_POLICY_VERSION } from './workflow/theme-generation-policy.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const DEFAULT_DEFINITIONS_FILE=path.join(ROOT,'src/components/themes/generated-theme-definitions.mjs');
const BASELINE_HINTS={
  theme01:['企业','通用','教育','课程','生活方式','项目','工作总结'],
  theme02:['科技','ai','汽车','机器人','硬件','未来','发布会'],
  theme03:['工程','架构','系统','代码','开发者','技术方案','制造'],
  theme04:['消费','年轻','创意','产品','品牌活动','校园'],
  theme05:['数据','市场分析','经营分析','行业洞察','驾驶舱','研究数据'],
  theme06:['战略','产业链','网络','图谱','投资研究','复杂关系'],
  theme07:['论文','研究','白皮书','咨询','实验','学术','调研'],
  theme08:['高端','奢侈','精品','酒店','艺术发布','品牌提案'],
  theme09:['人物','故事','城市','文化','旅行','杂志','编辑'],
  theme10:['金融','财务','投资','基金','资本','经营报表'],
  theme11:['增长','营销','转化','商业计划','渠道','运营复盘'],
  theme12:['音乐','娱乐','潮流','活动','社区','游戏','演出'],
};

function parseArgs(argv) {
  const args={write:false};
  for(let i=0;i<argv.length;i+=1) {
    if(argv[i]==='--spec') args.spec=argv[++i];
    else if(argv[i]==='--plan') args.plan=argv[++i];
    else if(argv[i]==='--definitions') args.definitions=argv[++i];
    else if(argv[i]==='--write') args.write=true;
    else if(argv[i]==='--help') args.help=true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function applyExternalPlan(raw,plan) {
  if(!plan) return raw;
  if(!plan.theme?.key||!plan.recipe||!plan.generationMode) throw new Error('external plan must include theme, recipe, and generationMode');
  if(raw.key&&raw.key!==plan.theme.key) throw new Error(`theme spec key ${raw.key} does not match external plan key ${plan.theme.key}`);
  if(raw.generationMode&&raw.generationMode!==plan.generationMode) throw new Error(`theme spec generationMode ${raw.generationMode} does not match external plan mode ${plan.generationMode}`);
  if(raw.policyVersion!=null&&Number(raw.policyVersion)!==Number(plan.policyVersion)) throw new Error('theme spec policyVersion does not match external plan');
  if(raw.planDigest&&raw.planDigest!==plan.planDigest) throw new Error('theme spec planDigest does not match external plan');
  return {
    ...raw,
    key:plan.theme.key,
    displayName:raw.displayName||plan.theme.displayName,
    generationMode:plan.generationMode,
    policyVersion:plan.policyVersion,
    planDigest:plan.planDigest,
    scenario:raw.scenario||plan.theme.scenario,
    audience:raw.audience||plan.theme.audience,
    baselineTheme:plan.recipe.sources?.[0],
    sourceThemes:plan.recipe.sources,
    pageCount:plan.recipe.pageCount,
    ownModuleMinimum:plan.recipe.ownModuleMinimum,
    pinnedModules:plan.recipe.pinnedModules||[],
    familyWeights:plan.recipe.familyWeights,
  };
}

function normalizeList(value,name) {
  const list=Array.isArray(value)?value:String(value||'').split(/[、,，]/);
  const normalized=list.map(item=>String(item).trim()).filter(Boolean);
  if(normalized.length<2) throw new Error(`${name} must contain at least two concrete entries`);
  return normalized;
}

function recommendBaseline(spec) {
  const text=[spec.displayName,...spec.scenario,...spec.audience].join(' ').toLowerCase();
  const scores=Object.entries(BASELINE_HINTS).map(([key,keywords])=>({key,score:keywords.reduce((sum,keyword)=>sum+(text.includes(keyword)?keyword.length:0),0)})).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  return {selected:scores[0].score?scores[0].key:'theme01',ranking:scores.slice(0,4)};
}

function validateSpec(raw) {
  const qualityVersion=Number(raw.qualityVersion);
  if(qualityVersion!==3) throw new Error('qualityVersion must be 3 for observed anchors, Style DNA-derived modules, full-layout validation, and auto-install');
  if(!raw.generationMode) throw new Error('generationMode is required for qualityVersion 3 themes');
  const policy=resolveThemeGenerationPolicy(raw.generationMode);
  const generationMode=policy.generationMode;
  const policyVersion=Number(raw.policyVersion??THEME_GENERATION_POLICY_VERSION);
  if(policyVersion!==THEME_GENERATION_POLICY_VERSION) throw new Error(`policyVersion ${policyVersion} is incompatible with generator policy ${THEME_GENERATION_POLICY_VERSION}`);
  const planDigest=raw.planDigest==null?null:String(raw.planDigest);
  const key=String(raw.key||'');
  if(!/^theme\d{2,}$/.test(key)||Number(key.slice(5))<=12) throw new Error('key must be a theme number greater than theme12');
  const displayName=String(raw.displayName||'').trim();
  if(!displayName) throw new Error('displayName is required');
  const scenario=normalizeList(raw.scenario,'scenario');
  const audience=normalizeList(raw.audience,'audience');
  const tokens=raw.tokens||{};
  for(const field of ['background','foreground','accent','secondary']) if(!/^#[0-9a-f]{6}$/i.test(tokens[field]||'')) throw new Error(`tokens.${field} must be a six-digit hex color`);
  const motif=String(tokens.motif||raw.motif||'');
  if(!/^[a-z][a-z0-9-]*$/.test(motif)) throw new Error('tokens.motif must be a lowercase theme-local identifier');
  const profile=raw.profile||{};
  for(const field of ['heading','body','density','frame','chart','media','ornament','context']) if(!String(profile[field]||'').trim()) throw new Error(`profile.${field} is required`);
  if(!Number.isFinite(Number(profile.radius))||Number(profile.radius)<0) throw new Error('profile.radius must be a non-negative number');
  if(!['adaptive','strict'].includes(profile.paletteMode)) throw new Error('profile.paletteMode must be adaptive or strict');
  if(!String(profile.backgroundCss||'').trim()) throw new Error('profile.backgroundCss is required and must come from the external visual evidence');
  if(!Array.isArray(profile.vocabulary)||profile.vocabulary.map(String).filter(Boolean).length<3) throw new Error('profile.vocabulary must contain at least three theme-specific terms');
  const recommendation=recommendBaseline({displayName,scenario,audience});
  const baselineTheme=String(raw.baselineTheme||recommendation.selected);
  if(!/^theme(?:0[1-9]|1[0-2])$/.test(baselineTheme)) throw new Error('baselineTheme must be theme01-theme12');
  const pageCount=Number(raw.pageCount||84);
  if(!Number.isInteger(pageCount)||pageCount<76||pageCount>96) throw new Error('pageCount must be an integer from 76 to 96');
  const ownModuleMinimum=Number(raw.ownModuleMinimum??policy.minimumOwnedModules);
  if(!Number.isInteger(ownModuleMinimum)||ownModuleMinimum<policy.minimumOwnedModules||ownModuleMinimum>pageCount) throw new Error(`ownModuleMinimum must be an integer from ${policy.minimumOwnedModules} to pageCount for ${generationMode}`);
  const suggestedSources=[baselineTheme,...recommendation.ranking.map(item=>item.key)].filter((item,index,list)=>list.indexOf(item)===index).slice(0,3);
  const sourceThemes=(raw.sourceThemes||suggestedSources).map(String);
  if(sourceThemes.length<2||sourceThemes.length>5||new Set(sourceThemes).size!==sourceThemes.length) throw new Error('sourceThemes must contain 2-5 unique original themes');
  if(sourceThemes.some(theme=>!/^theme(?:0[1-9]|1[0-2])$/.test(theme))) throw new Error('sourceThemes may only contain theme01-theme12');
  if(sourceThemes[0]!==baselineTheme) throw new Error('sourceThemes[0] must equal baselineTheme because it is the primary structural source');
  if(raw.pinnedModules!=null&&!Array.isArray(raw.pinnedModules)) throw new Error('pinnedModules must be an array');
  const pinnedModules=(raw.pinnedModules||[]).map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error(`pinnedModules[${index}] must be an object`);
    const sourceTheme=String(item.sourceTheme||'');
    const sourcePageKey=String(item.sourcePageKey||'');
    const family=String(item.family||'');
    if(!sourceThemes.includes(sourceTheme)) throw new Error(`pinnedModules[${index}].sourceTheme must be listed in sourceThemes`);
    if(!sourcePageKey.startsWith(`${sourceTheme}_page`)) throw new Error(`pinnedModules[${index}].sourcePageKey must identify a page from ${sourceTheme}`);
    if(!family) throw new Error(`pinnedModules[${index}].family is required`);
    return {...item,sourceTheme,sourcePageKey,family};
  });
  if(new Set(pinnedModules.map(item=>`${item.sourceTheme}:${item.sourcePageKey}`)).size!==pinnedModules.length) throw new Error('pinnedModules must not contain duplicate source pages');
  const familyWeights=raw.familyWeights||undefined;
  if(familyWeights&&Object.values(familyWeights).some(value=>!Number.isFinite(Number(value))||Number(value)<0)) throw new Error('familyWeights values must be non-negative numbers');
  return {key,displayName,generationMode,policyVersion,planDigest,scenario,audience,tokens:{...tokens,motif},profile:{...profile,generationMode,policyVersion,qualityVersion,radius:Number(profile.radius),vocabulary:profile.vocabulary.map(String)},baselineTheme,pageCount,ownModuleMinimum,sourceThemes,pinnedModules,familyWeights,recommendation,capabilityTargets:{minimumAverageLeaves:policy.minimumAverageLeaves,minimumAverageArrays:policy.minimumAverageArrays}};
}

function quote(value) {
  return `'${String(value).replaceAll('\\','\\\\').replaceAll("'","\\'")}'`;
}

function snippets(spec) {
  return {
    baseline:`  ${spec.key}:${quote(spec.baselineTheme)},`,
    recipe:`  ${spec.key}:${JSON.stringify({pageCount:spec.pageCount,sources:spec.sourceThemes,generationMode:spec.generationMode,policyVersion:spec.policyVersion,...(spec.planDigest?{planDigest:spec.planDigest}:{}),capabilityTargets:spec.capabilityTargets,...(spec.familyWeights?{familyWeights:spec.familyWeights}:{}),...(spec.pinnedModules.length?{pinnedModules:spec.pinnedModules}:{})})},`,
    ownModules:`  ${spec.key}:{module:'./signature-pages.jsx',manifest:'./signature-modules.json',minimum:${spec.ownModuleMinimum}},`,
    definition:`  [${[spec.key,spec.displayName,spec.scenario.join('、'),spec.audience.join('、')].map(quote).join(', ')}, ${JSON.stringify(spec.tokens)}, ${JSON.stringify(spec.profile)}],`,
  };
}

function insertBefore(source,anchor,line) {
  const index=source.indexOf(anchor);
  if(index<0) throw new Error(`Authoring source anchor not found: ${anchor}`);
  return `${source.slice(0,index)}${line}\n${source.slice(index)}`;
}

function writeSpec(spec,definitionsFile) {
  let source=fs.readFileSync(definitionsFile,'utf8');
  if(source.includes(`${spec.key}:`)||source.includes(`[${quote(spec.key)},`)) throw new Error(`${spec.key} already exists in generated-theme-definitions.mjs`);
  const parts=snippets(spec);
  source=insertBefore(source,'  // @new-theme:baseline',parts.baseline);
  source=insertBefore(source,'  // @new-theme:recipe',parts.recipe);
  source=insertBefore(source,'  // @new-theme:own-modules',parts.ownModules);
  source=insertBefore(source,'  // @new-theme:definition',parts.definition);
  fs.writeFileSync(definitionsFile,source);
}

const args=parseArgs(process.argv.slice(2));
if(args.help||!args.spec) {
  console.log('Usage: node scripts/prepare-new-theme.mjs --spec <theme-spec.json> [--plan <external-plan.json>] [--definitions <file>] [--write]');
  console.log('Without --write the command validates the spec, recommends a baseline, and prints the exact source entries.');
  process.exit(args.help?0:1);
}
const planPath=args.plan?path.resolve(process.cwd(),args.plan):null;
const externalPlan=planPath?JSON.parse(fs.readFileSync(planPath,'utf8')):null;
const raw=applyExternalPlan(JSON.parse(fs.readFileSync(path.resolve(process.cwd(),args.spec),'utf8')),externalPlan);
const spec=validateSpec(raw);
const parts=snippets(spec);
const definitionsFile=path.resolve(process.cwd(),args.definitions||DEFAULT_DEFINITIONS_FILE);
if(args.write) writeSpec(spec,definitionsFile);
console.log(JSON.stringify({
  ok:true,
  mode:args.write?'written':'preview',
  theme:spec.key,
  generationMode:spec.generationMode,
  policyVersion:spec.policyVersion,
  planDigest:spec.planDigest,
  externalPlan:planPath,
  definitionsFile,
  baselineTheme:spec.baselineTheme,
  pageCount:spec.pageCount,
  ownModuleMinimum:spec.ownModuleMinimum,
  sourceThemes:spec.sourceThemes,
  pinnedModules:spec.pinnedModules,
  baselineRecommendation:spec.recommendation.ranking,
  entries:parts,
  next:args.write?[
    `npm run themes:finalize -- --theme ${spec.key}`,
  ]:['Review baselineTheme and visual tokens, then rerun with --write.'],
},null,2));
