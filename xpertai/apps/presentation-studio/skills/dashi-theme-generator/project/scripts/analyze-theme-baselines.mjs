#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { THEME_PAGES, getLayoutRecord } from './workflow/theme-registry.mjs';
import { getMediaSlotsForLayout, isWritableMediaSlot, mediaSlotCapacity } from './workflow/media-slots.mjs';
import { moduleFamily } from '../src/components/themes/generated-theme-module-composer.mjs';
import { inspectLayout } from './workflow/inspect-fillplan.mjs';

const ORIGINAL_THEME_KEYS=Array.from({length:12},(_,index)=>`theme${String(index+1).padStart(2,'0')}`);
const BASELINE_PROFILES={
  theme01:{name:'轻拟态通用叙事',bestFor:'企业汇报、产品介绍、教育与通用叙事',strengths:'封面、指标卡、步骤、比较、故事、媒体与结论的均衡组合'},
  theme02:{name:'炫光科技发布',bestFor:'AI、汽车、机器人、硬件与未来科技',strengths:'技术参数、产品拆解、发布节奏、媒体英雄页和高对比信息层级'},
  theme03:{name:'深浅代码工程',bestFor:'系统架构、工程方案、开发者内容',strengths:'工程结构、3D 对象、代码语义、技术流程、验证与组件关系'},
  theme04:{name:'玻璃糖果产品',bestFor:'消费产品、年轻品牌、创意活动',strengths:'玻璃卡片、趣味数据、产品场景、对比、媒体与轻量关系结构'},
  theme05:{name:'色谱图表分析',bestFor:'市场研究、经营分析、数据报告',strengths:'图表覆盖最广，含排名、堆叠、矩阵、流向、分布、指标和媒体案例'},
  theme06:{name:'深色图谱战略',bestFor:'复杂战略、产业网络、投资研究',strengths:'高密度关系图、网络、路径、风险、矩阵、数据墙与深色分析结构'},
  theme07:{name:'冷白调研报告',bestFor:'白皮书、咨询、论文与正式研究',strengths:'问题、方法、证据、表格、矩阵、比较、引用与研究结论'},
  theme08:{name:'黑金实验发布',bestFor:'高端品牌、精品发布、实验型提案',strengths:'高端媒体、产品特写、黑金指标、陈列、对比和戏剧化收束'},
  theme09:{name:'深蓝杂志编辑',bestFor:'人物、品牌故事、城市和文化叙事',strengths:'目录、社论、大字、人物、图文、时间线、案例、引语和杂志节奏'},
  theme10:{name:'金色金融指数',bestFor:'金融、投资、财务与经营报告',strengths:'金融指标、收益风险、指数、组合、表格、趋势和投资判断'},
  theme11:{name:'高能增长营销',bestFor:'增长复盘、商业计划、营销活动',strengths:'漏斗、增长路径、转化、渠道、实验、节奏、指标和行动闭环'},
  theme12:{name:'声波霓虹娱乐',bestFor:'音乐、娱乐、潮流、社区活动',strengths:'声波、舞台、霓虹指标、活动节奏、人物、媒体和情绪化收束'},
};

const FAMILY_RULES=[['cover','封面与开场'],['transition','章节与过渡'],['metrics','指标与总览'],['comparison','比较与象限'],['timeline','时间与路径'],['relationship','关系与网络'],['distribution','构成与分布'],['ranking','排行与趋势'],['proportion','比例与能力'],['table','表格与清单'],['media','媒体与案例'],['statement','观点与引语'],['closing','结论与收束']];

function parseArgs(argv) {
  const args={format:'markdown',out:null};
  for(let i=0;i<argv.length;i+=1) {
    if(argv[i]==='--json') args.format='json';
    else if(argv[i]==='--markdown') args.format='markdown';
    else if(argv[i]==='--out') args.out=argv[++i];
    else if(argv[i]==='--help') args.help=true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function leafCount(value) {
  if(value==null) return 0;
  if(Array.isArray(value)) return value.reduce((sum,item)=>sum+leafCount(item),0);
  if(typeof value==='object') return Object.values(value).reduce((sum,item)=>sum+leafCount(item),0);
  return 1;
}

function arrayCount(value) {
  if(value==null) return 0;
  if(Array.isArray(value)) return 1+value.reduce((sum,item)=>sum+arrayCount(item),0);
  if(typeof value==='object') return Object.values(value).reduce((sum,item)=>sum+arrayCount(item),0);
  return 0;
}

function structuralFamily(page,record) {
  return moduleFamily({...page,roles:[...(page.roles||[]),...(record?.contract?.roles||[]),...(record?.roles||[])]});
}

function summarizeTheme(themeKey) {
  const pages=THEME_PAGES.filter(page=>page.themeKey===themeKey);
  const records=pages.map(page=>getLayoutRecord(page.key));
  const families=Object.fromEntries([...FAMILY_RULES.map(([key,label])=>[key,{label,count:0,examples:[]}]),['general',{label:'通用信息结构',count:0,examples:[]}]]);
  const controlTypes={};
  let writableMediaLayouts=0;
  let maxMediaCapacity=0;
  let contentLockedLayouts=0;
  const pageModules=[];
  for(const [index,page] of pages.entries()) {
    const record=records[index];
    const inspection=inspectLayout(page.key,{compact:true});
    const family=structuralFamily(page,record);
    families[family].count+=1;
    if(families[family].examples.length<4) families[family].examples.push(`${page.key} (${page.slot})`);
    for(const control of record.controls||[]) {
      const type=control.type||'unknown';
      controlTypes[type]=(controlTypes[type]||0)+1;
    }
    const writable=getMediaSlotsForLayout(page.key).filter(isWritableMediaSlot);
    if(writable.length) {
      writableMediaLayouts+=1;
      maxMediaCapacity=Math.max(maxMediaCapacity,...writable.map(mediaSlotCapacity));
    }
    if(record.contract?.contentLocked) contentLockedLayouts+=1;
    pageModules.push({
      key:page.key,
      slot:page.slot,
      label:page.label,
      family,
      leafFields:leafCount(record.defaultProps),
      arrays:arrayCount(record.defaultProps),
      controls:[...new Set((record.controls||[]).map(control=>control.type||'unknown'))],
      controlKeys:(inspection.controls||[]).map(control=>control.publicKey||control.key),
      copyKeys:inspection.copyKeys||[],
      propShapes:inspection.propShapes||{},
      countBindings:inspection.countBindings||[],
      mediaSlots:(inspection.mediaSlots||[]).map(slot=>({field:slot.field,write:slot.presetProp||slot.writableProp,max:slot.maxCount||slot.max,acceptedKinds:slot.acceptedKinds,canPresetMedia:slot.canPresetMedia})),
      writableMediaSlots:writable.length,
      mediaCapacity:writable.reduce((sum,slot)=>sum+mediaSlotCapacity(slot),0),
      contentLocked:Boolean(record.contract?.contentLocked),
    });
  }
  const leafCounts=records.map(record=>leafCount(record.defaultProps));
  const arrayCounts=records.map(record=>arrayCount(record.defaultProps));
  return {
    key:themeKey,
    ...BASELINE_PROFILES[themeKey],
    pageCount:pages.length,
    fields:{average:Number((leafCounts.reduce((a,b)=>a+b,0)/Math.max(1,leafCounts.length)).toFixed(1)),min:Math.min(...leafCounts),max:Math.max(...leafCounts)},
    arrays:{average:Number((arrayCounts.reduce((a,b)=>a+b,0)/Math.max(1,arrayCounts.length)).toFixed(1)),min:Math.min(...arrayCounts),max:Math.max(...arrayCounts)},
    controls:{total:Object.values(controlTypes).reduce((a,b)=>a+b,0),types:controlTypes},
    media:{writableLayouts:writableMediaLayouts,maxCapacity:maxMediaCapacity},
    contentLockedLayouts,
    families,
    pages:pageModules,
  };
}

function analyze() {
  return {
    generatedAt:new Date().toISOString(),
    source:'src/components/themes/theme01-theme12/metadata.js + normalized layout contracts',
    familyRules:Object.fromEntries(FAMILY_RULES.map(([key,label])=>[key,label])),
    themes:ORIGINAL_THEME_KEYS.map(summarizeTheme),
  };
}

function markdown(report) {
  const lines=[
    '# 原 12 主题能力矩阵（自动生成）','',
    '> 数据来源：`theme01-theme12/metadata.js`、标准化页面契约与媒体槽分析。使用 `npm run themes:analyze-baselines -- --out ../references/original-theme-capability-matrix.md` 重新生成。','',
    '## 总览','',
    '| 主题 | 页面 | 平均字段 | 平均数组结构 | 可写媒体页 | 单页最大媒体 | 适合场景 |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];
  for(const theme of report.themes) lines.push(`| ${theme.key} ${theme.name} | ${theme.pageCount} | ${theme.fields.average} | ${theme.arrays.average} | ${theme.media.writableLayouts} | ${theme.media.maxCapacity} | ${theme.bestFor} |`);
  lines.push('','## 结构家族覆盖','');
  const familyKeys=[...FAMILY_RULES.map(([key])=>key),'general'];
  lines.push(`| 主题 | ${familyKeys.map(key=>report.themes[0].families[key].label).join(' | ')} |`);
  lines.push(`|---|${familyKeys.map(()=> '---:').join('|')}|`);
  for(const theme of report.themes) lines.push(`| ${theme.key} | ${familyKeys.map(key=>theme.families[key].count).join(' | ')} |`);
  for(const theme of report.themes) {
    lines.push('',`## ${theme.key} ${theme.name}`,'',`- 适合：${theme.bestFor}` ,`- 结构优势：${theme.strengths}`,`- 字段：平均 ${theme.fields.average}，范围 ${theme.fields.min}-${theme.fields.max}` ,`- 数组结构：平均 ${theme.arrays.average}，范围 ${theme.arrays.min}-${theme.arrays.max}`,`- 控件：${theme.controls.total} 个；${Object.entries(theme.controls.types).map(([key,value])=>`${key} ${value}`).join('、')}`,`- 媒体：${theme.media.writableLayouts} 个可写媒体页面，单页最多 ${theme.media.maxCapacity} 个媒体槽`,'','代表页面：','');
    for(const family of Object.values(theme.families).filter(item=>item.count)) lines.push(`- ${family.label}（${family.count}）：${family.examples.join('、')}`);
    lines.push('','### 完整页面模块清单','', '| 页面键 | 槽位 | 页面标签 | 结构家族 | 叶字段 | 数组 | 控件类型 | 可写媒体槽 / 容量 | 内容锁定 |','|---|---|---|---|---:|---:|---|---:|---|');
    for(const page of theme.pages) lines.push(`| ${page.key} | ${page.slot} | ${String(page.label||'').replaceAll('|','\\|')} | ${theme.families[page.family].label} | ${page.leafFields} | ${page.arrays} | ${page.controls.join('、')||'-'} | ${page.writableMediaSlots} / ${page.mediaCapacity} | ${page.contentLocked?'是':'否'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const args=parseArgs(process.argv.slice(2));
if(args.help) {
  console.log('Usage: node scripts/analyze-theme-baselines.mjs [--markdown|--json] [--out <file>]');
  process.exit(0);
}
const report=analyze();
const output=args.format==='json'?`${JSON.stringify(report,null,2)}\n`:markdown(report);
if(args.out) {
  const target=path.resolve(process.cwd(),args.out);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,output);
  console.log(`Wrote ${target}`);
} else process.stdout.write(output);
