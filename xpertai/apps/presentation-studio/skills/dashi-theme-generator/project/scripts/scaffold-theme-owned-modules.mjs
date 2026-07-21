#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args={};
  for(let index=0;index<argv.length;index+=1) {
    if(argv[index]==='--plan') args.plan=argv[++index];
    else if(argv[index]==='--theme-dir') args.themeDir=argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if(!args.plan) throw new Error('--plan is required');
  return args;
}

const args=parseArgs(process.argv.slice(2));
const planPath=path.resolve(process.cwd(),args.plan);
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
const proposals=plan.ownedModuleProposals||[];
if(!proposals.length) throw new Error('Plan has no ownedModuleProposals. Regenerate it with themes:external-plan.');
const themeDir=path.resolve(process.cwd(),args.themeDir||`src/components/themes/${plan.theme.key}`);
fs.mkdirSync(themeDir,{recursive:true});
const manifestPath=path.join(themeDir,'signature-modules.json');
const sourcePath=path.join(themeDir,'signature-pages.jsx');
for(const target of [manifestPath,sourcePath]) if(fs.existsSync(target)) throw new Error(`${target} already exists; refusing to overwrite authored modules`);

const manifest={
  schemaVersion:3,
  qualityVersion:Number(plan.qualityVersion)||3,
  generationMode:plan.generationMode||'fidelity',
  policyVersion:plan.policyVersion,
  planDigest:plan.planDigest,
  themeKey:plan.theme.key,
  externalPlan:path.relative(themeDir,planPath),
  styleGrammar:plan.styleGrammar,
  moduleSources:plan.moduleSources,
  modules:proposals.map(item=>({...item,implementationStatus:'scaffold'})),
};
fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);

function defaultValueForField(field) {
  if(['media','image','images'].includes(field)) return [];
  if(field==='values') return [64,78,86];
  if(field==='labels') return ['方向 A','方向 B','方向 C'];
  if(field==='trend') return [34,46,58,72,81];
  if(field==='links') return [['node-a','node-b'],['node-b','node-c']];
  if(field==='rows') return [
    {label:'重点区域',value:'领先',note:'保持增长节奏'},
    {label:'潜力区域',value:'改善',note:'验证关键动作'},
    {label:'关注区域',value:'承压',note:'明确修复路径'},
  ];
  if(field==='columns') return ['行动','负责人','状态'];
  if(field==='dates') return ['Q1','Q2','Q3'];
  if(field==='numbers') return ['01','02','03'];
  if(['items','nodes','segments','metrics','options','criteria','stages','facts','sections'].includes(field)) return Array.from({length:3},(_,index)=>({
    id:`item-${index+1}`,
    title:`可编辑条目 ${index+1}`,
    label:`条目 ${index+1}`,
    body:'替换为主题内容并保留当前结构层级',
    value:`${64+index*9}%`,
  }));
  return `可编辑${field}`;
}

function scaffoldDefaults(item) {
  if(item.strategy==='modify'&&item.sourceContract?.sourceDefaultProps) return item.sourceContract.sourceDefaultProps;
  const fields=item.requiredCapabilities?.contentShape||[];
  const defaults=Object.fromEntries([...new Set(['title',...fields])].map(field=>[
    field,
    field==='title'?`${plan.theme.displayName} · ${item.archetypeId}`:defaultValueForField(field),
  ]));
  defaults.showOrnament=true;
  if(item.requiredCapabilities?.writableMedia) {
    defaults.images=Array.isArray(defaults.images)?defaults.images:[];
    defaults.imageCount=Math.max(1,Number(defaults.imageCount)||1);
  }
  return defaults;
}

function ensureControlEffect(control) {
  if(control.effect||!['toggle','select','radio','range','slider','number','color','palette'].includes(control.type)) return control;
  const global=/color|palette|tone|background/i.test(`${control.key||''} ${control.label||''}`);
  const layout=/count|density|layout|direction|column|row/i.test(`${control.key||''} ${control.label||''}`);
  return {...control,effect:global
    ? {scope:'global',targets:['canvas','surface','typography'],minChangedRatio:.15,minRegions:8}
    : layout
      ? {scope:'section',targets:['layout','surface'],minChangedRatio:.01,minRegions:2}
      : {scope:'component',targets:['ornament'],minChangedRatio:.005,minRegions:1}};
}

function scaffoldControls(item) {
  if(item.strategy==='modify'&&Array.isArray(item.sourceContract?.sourceControlDefinitions)) {
    return item.sourceContract.sourceControlDefinitions.map(ensureControlEffect);
  }
  const fields=item.requiredCapabilities?.contentShape||[];
  const repeated=fields.find(field=>['items','nodes','segments','metrics','options','criteria','stages','facts','sections','rows'].includes(field));
  const controls=[
    {key:'showOrnament',label:'主题装饰',type:'toggle',default:true,effect:{scope:'component',targets:['ornament'],minChangedRatio:.005,minRegions:1}},
  ];
  if(repeated) controls.push({key:`${repeated}Count`,label:'可见条目',type:'range',min:1,max:5,default:3,arrays:[repeated],effect:{scope:'section',targets:['layout','surface'],minChangedRatio:.01,minRegions:2}});
  if(item.requiredCapabilities?.writableMedia) controls.push({
    key:'imageCount',label:'图片数量',type:'range',min:0,max:3,default:1,
    arrays:['images'],
    mediaSlots:[{field:'images',fieldPath:'props.images',presetProp:'props.images',countKey:'imageCount',acceptedKinds:['image'],max:3,canPresetMedia:true,initialSrcSupported:true}],
    effect:{scope:'section',targets:['media','layout'],minChangedRatio:.01,minRegions:2},
  });
  return controls;
}

function scaffoldMediaSlots(item) {
  if(item.strategy==='modify') return item.sourceContract?.sourceMediaSlotDefinitions||[];
  if(!item.requiredCapabilities?.writableMedia) return [];
  return [{field:'images',fieldPath:'props.images',presetProp:'props.images',countKey:'imageCount',acceptedKinds:['image'],max:3,canPresetMedia:true,initialSrcSupported:true}];
}

const pageBlocks=proposals.map(item=>`function ${item.componentName}(props) {
  // Replace this scaffold with a real ${item.evidenceMode||'observed'} ${item.family} module.
  // ${item.evidenceMode==='inferred'?`Derive it from Style DNA rules ${item.derivedFromRules.join(', ')} and anchors ${item.anchorModuleRefs.join(', ')}.`:`Reconstruct the structure observed in ${item.evidenceRefs.join(', ')}.`}
  // Validation intentionally rejects scaffold status.
  return <div style={{width:'100%',height:'100%',padding:96,boxSizing:'border-box',background:'#f4f4f2',overflow:'hidden'}}>
    <p>${item.family.toUpperCase()} / ${item.archetypeId}</p>
    <h1>{props.title}</h1>
  </div>;
}`).join('\n\n');
const pageEntries=proposals.map(item=>`  {
    key:'${item.id}', slot:'signature-${item.archetypeId}', label:'${item.evidenceMode==='inferred'?'Style-derived':'External signature'} · ${item.archetypeId}',
    roles:['${item.family}'], moduleFamily:'${item.family}', archetypeId:'${item.archetypeId}', moduleStrategy:'${item.strategy}',
    evidenceMode:'${item.evidenceMode||'observed'}', evidenceRefs:${JSON.stringify(item.evidenceRefs||[])},
    derivedFromRules:${JSON.stringify(item.derivedFromRules||[])}, anchorModuleRefs:${JSON.stringify(item.anchorModuleRefs||[])},
    stylePrimitiveRefs:${JSON.stringify(item.stylePrimitiveRefs||[])}, derivationReason:${JSON.stringify(item.derivationReason||null)},
    styleSignals:${JSON.stringify(item.styleSignals||[])}, sourceContract:${JSON.stringify(item.sourceContract)},
    canvasContract:{designWidth:1920,designHeight:1080,rootMode:'fill-parent',backgroundMode:'opaque'},
    defaultProps:${JSON.stringify(scaffoldDefaults(item))},
    controls:${JSON.stringify(scaffoldControls(item))},
    mediaSlots:${JSON.stringify(scaffoldMediaSlots(item))},
    Component:${item.componentName},
  }`).join(',\n');
fs.writeFileSync(sourcePath,`import React from 'react';\n\n${pageBlocks}\n\nexport const signaturePages=[\n${pageEntries}\n];\n`);
console.log(JSON.stringify({
  status:'scaffolded',
  terminal:false,
  deliverable:false,
  userActionRequired:false,
  agentActionRequired:true,
  themeKey:plan.theme.key,
  generationMode:plan.generationMode||'fidelity',
  moduleCount:proposals.length,
  manifestPath,
  sourcePath,
  nextAction:{
    action:'implement-theme-owned-modules',
    instruction:'Continue in the current agent run. Replace every scaffold with evidence-specific JSX, complete defaults/controls/media slots, and set every manifest implementationStatus to implemented. Do not ask the user to implement JSX manually.',
    completion:'Run the full finalize command, save the package to Workspace Files, and register it until the theme status is ready.',
  },
}));
