#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { THEME_PAGES, getLayoutRecord } from './workflow/theme-registry.mjs';
import { getMediaSlotsForLayout, isWritableMediaSlot } from './workflow/media-slots.mjs';
import { moduleFamily } from '../src/components/themes/generated-theme-module-composer.mjs';
import { createHash } from 'node:crypto';
import { resolveThemeGenerationPolicy, THEME_GENERATION_POLICY_VERSION } from './workflow/theme-generation-policy.mjs';

const ORIGINAL=/^theme(?:0[1-9]|1[0-2])$/;
const FAMILIES=new Set(['cover','transition','metrics','comparison','timeline','relationship','distribution','ranking','proportion','table','media','statement','closing','general']);
const QUALITY_VERSION=3;
const STYLE_FIELDS={
  palette:'color',
  typography:'typography',
  composition:'composition',
  surfaces:'surface',
  imageTreatment:'media',
  motifs:'motif',
  signatureRules:'signature',
  forbidden:'forbidden',
};
const DERIVED_BLUEPRINTS=[
  {id:'section-transition',family:'transition',intent:'用模板的标题层级和签名符号建立章节过渡',contentShape:['kicker','title','sectionNumber']},
  {id:'ecosystem-relationship',family:'relationship',intent:'把模板的网格和节点符号扩展为关系网络',contentShape:['title','nodes','links']},
  {id:'composition-breakdown',family:'distribution',intent:'把模板的表面和色阶扩展为构成分析',contentShape:['title','segments','summary']},
  {id:'ranked-signals',family:'ranking',intent:'把模板的数字层级和分隔规则扩展为排行页',contentShape:['title','items','highlight']},
  {id:'proportion-scorecard',family:'proportion',intent:'把模板的指标语法扩展为比例与进度页',contentShape:['title','values','labels']},
  {id:'key-statement',family:'statement',intent:'用模板的留白、标题和签名符号生成观点页',contentShape:['kicker','statement','support']},
  {id:'alternate-cover',family:'cover',intent:'在不改变 Style DNA 的前提下生成第二种封面构图',contentShape:['kicker','title','subtitle','images'],mediaCapability:{field:'images',max:1}},
  {id:'editorial-overview',family:'general',intent:'把模板的常规网格扩展为信息总览页',contentShape:['title','lead','items']},
  {id:'metric-dashboard',family:'metrics',intent:'把模板的数字、表面和图表语法扩展为指标总览',contentShape:['title','metrics','trend']},
  {id:'decision-comparison',family:'comparison',intent:'把模板的分栏和强调规则扩展为决策对比',contentShape:['title','options','criteria']},
  {id:'roadmap-timeline',family:'timeline',intent:'把模板的线条、标签和节奏扩展为路线图',contentShape:['title','stages','dates']},
  {id:'action-table',family:'table',intent:'把模板的分隔线和层级扩展为行动清单',contentShape:['title','columns','rows']},
  {id:'media-case-study',family:'media',intent:'把模板的图片裁切与图注语法扩展为案例页',contentShape:['title','images','caption','facts'],mediaCapability:{field:'images',max:3}},
  {id:'closing-call',family:'closing',intent:'用模板的封面语法和签名符号生成收束页',contentShape:['title','subtitle','action']},
  {id:'metric-story',family:'metrics',intent:'把单一指标与模板的叙事构图组合成指标故事页',contentShape:['kicker','metric','title','body']},
  {id:'agenda-overview',family:'general',intent:'把模板的编号和分隔规则扩展为议程页',contentShape:['title','sections','numbers']},
];
const ANCHOR_FAMILIES={
  cover:['cover','general','media'],transition:['cover','general','closing'],general:['general','cover','statement'],
  metrics:['metrics','general','comparison'],comparison:['comparison','metrics','general'],timeline:['timeline','general','comparison'],
  relationship:['relationship','timeline','comparison','general'],distribution:['metrics','comparison','general'],ranking:['metrics','table','comparison'],
  proportion:['metrics','comparison','general'],table:['table','general','comparison'],media:['media','cover','general'],
  statement:['statement','cover','general'],closing:['closing','cover','statement'],
};
const CONTENT_SHAPES={
  cover:['kicker','title','subtitle'],
  transition:['kicker','title','sectionNumber'],
  metrics:['title','metrics','trend'],
  comparison:['title','options','criteria'],
  timeline:['title','stages','dates'],
  relationship:['title','nodes','links'],
  distribution:['title','segments','summary'],
  ranking:['title','items','highlight'],
  proportion:['title','values','labels'],
  table:['title','columns','rows'],
  media:['title','images','caption','facts'],
  statement:['kicker','statement','support'],
  closing:['title','subtitle','action'],
  general:['title','lead','items'],
};

function parseArgs(argv) {
  const args={};
  for(let i=0;i<argv.length;i+=1) {
    if(argv[i]==='--spec') args.spec=argv[++i];
    else if(argv[i]==='--out') args.out=argv[++i];
    else if(argv[i]==='--help') args.help=true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function list(value,name,min=1) {
  if(!Array.isArray(value)) throw new Error(`${name} must be an array of strings`);
  const invalidIndex=value.findIndex(item=>typeof item!=='string'||!item.trim());
  if(invalidIndex>=0) throw new Error(`${name}[${invalidIndex}] must be a non-empty string`);
  if(value.length<min) throw new Error(`${name} must contain at least ${min} entries`);
  return value.map(item=>item.trim());
}

function assertSpecContract(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('external theme spec must be a JSON object');
  const policy=resolveThemeGenerationPolicy(raw.generationMode);
  const issues=[];
  if(!raw.generationMode) issues.push('generationMode is required and must be fidelity or reuse-first');
  if(!raw.target||typeof raw.target!=='object'||Array.isArray(raw.target)) issues.push('target is required');
  if(!raw.visualEvidence||typeof raw.visualEvidence!=='object'||Array.isArray(raw.visualEvidence)) issues.push('visualEvidence is required');
  else for(const field of Object.keys(STYLE_FIELDS)) {
    const value=raw.visualEvidence[field];
    if(!Array.isArray(value)) issues.push(`visualEvidence.${field} must be an array of evidence strings`);
    else {
      const invalidIndex=value.findIndex(item=>typeof item!=='string'||!item.trim());
      if(invalidIndex>=0) issues.push(`visualEvidence.${field}[${invalidIndex}] must be a non-empty evidence string, not an object`);
    }
  }
  if(!raw.visualImplementation||typeof raw.visualImplementation!=='object'||Array.isArray(raw.visualImplementation)) {
    issues.push('visualImplementation is required with profileStrategy, paletteMode, tokens, and requiredPrimitives');
  }
  if(!Array.isArray(raw.archetypes)) {
    issues.push(`archetypes is required and must contain at least ${policy.minimumArchetypes} distinct reference-page structures for ${policy.generationMode}`);
  }
  if(issues.length) throw new Error([
    'External theme spec does not satisfy the authoring contract:',
    ...issues.map(issue=>`- ${issue}`),
    'Follow references/external-theme-spec-contract.md and the canonical theme13/theme14 plan specs before retrying themes:external-plan.',
  ].join('\n'));
}

function validate(raw) {
  assertSpecContract(raw);
  const policy=resolveThemeGenerationPolicy(raw.generationMode);
  const generationMode=policy.generationMode;
  if(!/^theme\d{2,}$/.test(raw.key||'')||Number(String(raw.key).slice(5))<=12) throw new Error('key must be a theme number greater than theme12');
  if(!String(raw.displayName||'').trim()) throw new Error('displayName is required');
  const references=list(raw.references,'references',policy.minimumReferences);
  const pageCount=Number(raw.target?.pageCount);
  if(!Number.isInteger(pageCount)||pageCount<76||pageCount>96) throw new Error('target.pageCount must be an integer from 76 to 96');
  const derivedModuleCount=Number(raw.target?.derivedModuleCount??policy.minimumInferredModules);
  if(!Number.isInteger(derivedModuleCount)||derivedModuleCount<policy.minimumInferredModules||derivedModuleCount>policy.maximumInferredModules) throw new Error(`target.derivedModuleCount must be an integer from ${policy.minimumInferredModules} to ${policy.maximumInferredModules} for ${generationMode}`);
  const observedModuleCount=Number(raw.target?.observedModuleCount??policy.defaultObservedModules);
  if(!Number.isInteger(observedModuleCount)||observedModuleCount<policy.minimumObservedModules||observedModuleCount>policy.maximumObservedModules) throw new Error(`target.observedModuleCount must be an integer from ${policy.minimumObservedModules} to ${policy.maximumObservedModules} for ${generationMode}`);
  const scenario=list(raw.target?.scenario,'target.scenario',2);
  const audience=list(raw.target?.audience,'target.audience',2);
  const visualInput=raw.visualEvidence||{};
  const visual={};
  for(const name of ['palette','typography','composition','surfaces','imageTreatment','motifs','signatureRules','forbidden']) visual[name]=list(visualInput[name],`visualEvidence.${name}`,name==='palette'?4:2);
  const sourceThemes=list(raw.sourceThemes,'sourceThemes',2);
  if(sourceThemes.length>5||new Set(sourceThemes).size!==sourceThemes.length||sourceThemes.some(key=>!ORIGINAL.test(key))) throw new Error('sourceThemes must contain 2-5 unique keys from theme01-theme12');
  if(!Array.isArray(raw.archetypes)||raw.archetypes.length<policy.minimumArchetypes) throw new Error(`archetypes must describe at least ${policy.minimumArchetypes} distinct reference-page structures for ${generationMode}`);
  const archetypes=raw.archetypes.map((item,index)=>{
    if(!item.id||!FAMILIES.has(item.family)) throw new Error(`archetypes[${index}] requires id and a valid family`);
    if(!['reuse','modify','new'].includes(item.strategy)) throw new Error(`archetypes[${index}].strategy must be reuse, modify, or new`);
    const strategy=String(item.strategy);
    const reuseJustification=strategy==='reuse'?list(item.reuseJustification,`archetypes[${index}].reuseJustification`,policy.minimumReuseJustifications):[];
    return {...item,strategy,referencePages:list(item.referencePages,`archetypes[${index}].referencePages`),needsMedia:Boolean(item.needsMedia),notes:list(item.notes,`archetypes[${index}].notes`,policy.minimumNotesPerArchetype),reuseJustification};
  });
  if(new Set(archetypes.map(item=>item.id)).size!==archetypes.length) throw new Error('archetypes must use unique ids for distinct reference-page structures');
  const represented=new Set(archetypes.map(item=>item.family));
  for(const required of policy.requiredArchetypeFamilies) if(!represented.has(required)) throw new Error(`archetypes must include ${required} for ${generationMode}`);
  const complexFamilies=['comparison','timeline','relationship','table','statement'].filter(family=>represented.has(family));
  if(complexFamilies.length<policy.minimumComplexFamilies) throw new Error(`archetypes must include at least ${policy.minimumComplexFamilies} families from comparison, timeline, relationship, table, or statement for ${generationMode}`);
  if(represented.size<policy.minimumArchetypeFamilies) throw new Error(`archetypes must cover at least ${policy.minimumArchetypeFamilies} structural families for ${generationMode}; found ${represented.size}`);
  const ownedCount=archetypes.filter(item=>item.strategy!=='reuse').length;
  if(ownedCount<policy.minimumObservedModules) throw new Error(`at least ${policy.minimumObservedModules} archetypes must use modify/new for ${generationMode}; found ${ownedCount}`);
  const implementation=raw.visualImplementation||{};
  if(!['new','reuse'].includes(implementation.profileStrategy)) throw new Error('visualImplementation.profileStrategy must be new or reuse');
  if(implementation.profileStrategy==='new'&&!String(implementation.profileId||'').trim()) throw new Error('visualImplementation.profileId is required for a new profile');
  if(implementation.profileStrategy==='reuse'&&!String(implementation.motif||'').trim()) throw new Error('visualImplementation.motif is required when reusing a profile');
  if(!['adaptive','strict'].includes(implementation.paletteMode)) throw new Error('visualImplementation.paletteMode must be adaptive or strict');
  for(const [name,value] of Object.entries(implementation.tokens||{})) if(!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`visualImplementation.tokens.${name} must be a six-digit hex color`);
  for(const required of ['background','foreground','accent','secondary']) if(!implementation.tokens?.[required]) throw new Error(`visualImplementation.tokens.${required} is required`);
  const requiredPrimitives=list(implementation.requiredPrimitives,'visualImplementation.requiredPrimitives',policy.minimumSignaturePrimitives);
  return {key:raw.key,displayName:raw.displayName,generationMode,references,pageCount,derivedModuleCount,observedModuleCount,scenario,audience,visual,implementation:{...implementation,requiredPrimitives},sourceThemes,archetypes};
}

function styleGrammar(spec) {
  const rules=[];
  for(const [field,category] of Object.entries(STYLE_FIELDS)) {
    for(const [index,description] of spec.visual[field].entries()) rules.push({
      id:`${category}-${String(index+1).padStart(2,'0')}`,
      category,
      description,
      sourceField:`visualEvidence.${field}`,
      evidenceRefs:spec.references,
    });
  }
  return {
    schemaVersion:1,
    rules,
    forbiddenRuleIds:rules.filter(rule=>rule.category==='forbidden').map(rule=>rule.id),
    primitives:spec.implementation.requiredPrimitives.map(id=>({id,evidenceRefs:spec.references})),
  };
}

function ruleRefsFor(grammar,blueprint,index) {
  const take=(category,offset=0)=>{
    const matches=grammar.rules.filter(rule=>rule.category===category);
    return matches.length?matches[(index+offset)%matches.length].id:undefined;
  };
  return [
    take('typography'),
    take('composition',1),
    take(blueprint.family==='media'?'media':'surface',2),
    take('motif',3)||take('signature',3),
    take('color',4),
  ].filter(Boolean);
}

function primitiveRefsFor(grammar,index) {
  const primitives=grammar.primitives||[];
  if(!primitives.length) return [];
  return [primitives[index%primitives.length]?.id,primitives[(index+1)%primitives.length]?.id].filter((id,position,list)=>id&&list.indexOf(id)===position);
}

function derivedBlueprints(spec) {
  const represented=new Set(spec.archetypes.map(item=>item.family));
  const weights={};
  for(const item of spec.archetypes) weights[item.family]=(weights[item.family]||0)+(Number(item.weight)||1);
  return [...DERIVED_BLUEPRINTS].sort((a,b)=>{
    const aMissing=represented.has(a.family)?1:0;
    const bMissing=represented.has(b.family)?1:0;
    return aMissing-bMissing||(weights[b.family]||0)-(weights[a.family]||0)||a.id.localeCompare(b.id);
  }).slice(0,spec.derivedModuleCount);
}

function anchorRefsFor(blueprint,observed) {
  const preferred=ANCHOR_FAMILIES[blueprint.family]||[blueprint.family,'general'];
  const ranked=[...observed].sort((a,b)=>{
    const aRank=preferred.indexOf(a.family);
    const bRank=preferred.indexOf(b.family);
    return (aRank<0?99:aRank)-(bRank<0?99:bRank)||a.id.localeCompare(b.id);
  });
  return ranked.slice(0,2).map(item=>item.id);
}

function leafCount(value) {
  if(value==null) return 0;
  if(Array.isArray(value)) return value.reduce((sum,item)=>sum+leafCount(item),0);
  if(typeof value==='object') return Object.values(value).reduce((sum,item)=>sum+leafCount(item),0);
  return 1;
}

function candidates(spec,archetype) {
  return THEME_PAGES.filter(page=>spec.sourceThemes.includes(page.themeKey)&&moduleFamily(page)===archetype.family).map(page=>{
    const record=getLayoutRecord(page.key);
    const media=getMediaSlotsForLayout(page.key).filter(isWritableMediaSlot);
    const sourceRank=spec.sourceThemes.indexOf(page.themeKey);
    const mediaPenalty=archetype.needsMedia&&!media.length?100000:0;
    const richness=leafCount(record?.defaultProps);
    return {
      layout:page.key,sourceTheme:page.themeKey,slot:page.slot,label:page.label,
      leafFields:richness,
      fieldKeys:Object.keys(record?.defaultProps||{}),
      controlKeys:(record?.controls||[]).map(control=>control.key).filter(Boolean),
      controlTypes:[...new Set((record?.controls||[]).map(control=>control.type).filter(Boolean))],
      countBindingKeys:(record?.countBindings||[]).map(binding=>binding.key).filter(Boolean),
      defaultProps:record?.defaultProps||{},
      controls:record?.controls||[],
      countBindings:record?.countBindings||[],
      lengthBindings:record?.lengthBindings||[],
      propShapes:record?.contract?.propShapes||{},
      numericBounds:record?.contract?.numericBounds||{},
      mediaSlots:media,
      writableMediaSlots:media.length,
      maxMediaCapacity:media.reduce((max,slot)=>Math.max(max,Number(slot.maxCount)||1),0),
      score:mediaPenalty+sourceRank*1000-richness,
    };
  }).filter(item=>item.score<100000).sort((a,b)=>a.score-b.score||a.layout.localeCompare(b.layout)).slice(0,8).map(({score,...item})=>item);
}

function observedPriority(item) {
  const signatureFamilyRank=['cover','general','media','metrics'].indexOf(item.family);
  const strategyRank=item.strategy==='modify'?0:item.strategy==='new'?1:2;
  return [signatureFamilyRank<0?99:signatureFamilyRank,strategyRank,-Number(item.weight||1),item.id];
}

function compareTuple(left,right) {
  for(let index=0;index<Math.max(left.length,right.length);index+=1) {
    if(left[index]===right[index]) continue;
    if(typeof left[index]==='number'&&typeof right[index]==='number') return left[index]-right[index];
    return String(left[index]).localeCompare(String(right[index]));
  }
  return 0;
}

function resolveReuseFirstStrategies(spec,mappings) {
  if(spec.generationMode!=='reuse-first') return mappings;
  const requested=mappings.filter(item=>item.strategy!=='reuse').sort((a,b)=>compareTuple(observedPriority(a),observedPriority(b)));
  const selected=[];
  const selectedFamilies=new Set();
  for(const item of requested) {
    if(selected.length>=spec.observedModuleCount) break;
    if(selectedFamilies.has(item.family)) continue;
    selected.push(item);
    selectedFamilies.add(item.family);
  }
  const promoted=new Set();
  if(selectedFamilies.size<resolveThemeGenerationPolicy(spec.generationMode).minimumOwnedFamilies) {
    const promotionPool=[...mappings].sort((a,b)=>compareTuple(observedPriority(a),observedPriority(b)));
    for(const item of promotionPool) {
      if(selected.length>=spec.observedModuleCount||selectedFamilies.size>=resolveThemeGenerationPolicy(spec.generationMode).minimumOwnedFamilies) break;
      if(selected.includes(item)||selectedFamilies.has(item.family)) continue;
      selected.push(item);
      selectedFamilies.add(item.family);
      promoted.add(item.id);
    }
  }
  for(const item of requested) {
    if(selected.length>=spec.observedModuleCount) break;
    if(!selected.includes(item)) selected.push(item);
  }
  const selectedIds=new Set(selected.map(item=>item.id));
  return mappings.map(item=>{
    if(selectedIds.has(item.id)) return {
      ...item,
      requestedStrategy:item.strategy,
      strategy:promoted.has(item.id)?'modify':item.strategy,
      strategyResolution:promoted.has(item.id)?'promoted-to-modify-for-owned-family-coverage':'kept-by-reuse-first-owned-budget',
    };
    if(item.strategy==='reuse') return {...item,requestedStrategy:item.strategy,strategyResolution:'kept-as-reuse'};
    const candidate=item.candidates[0];
    return {
      ...item,
      requestedStrategy:item.strategy,
      strategy:'reuse',
      strategyResolution:'converted-to-reuse-by-owned-budget',
      reuseJustification:[
        `系统选择 ${candidate.layout} 复用完整 ${item.family} 页面闭包`,
        `保留 ${candidate.leafFields} 个字段叶子、${candidate.controlKeys.length} 个控件和 ${candidate.writableMediaSlots} 个可写媒体槽`,
      ],
    };
  });
}

function preservedCapabilities(candidate) {
  return [
    'defaultProps',
    ...(candidate.controlKeys.length?['controls']:[]),
    ...(candidate.countBindingKeys.length?['countBindings']:[]),
    ...(candidate.writableMediaSlots?['mediaSlots']:[]),
    'runtimeSafe',
  ];
}

function sourceContract(candidate) {
  return {
    sourceTheme:candidate.sourceTheme,
    sourcePageKey:candidate.layout,
    sourceFields:candidate.fieldKeys,
    sourceControls:candidate.controlKeys,
    sourceControlTypes:candidate.controlTypes,
    sourceCountBindings:candidate.countBindingKeys,
    sourceMediaSlots:candidate.writableMediaSlots,
    sourceMediaCapacity:candidate.maxMediaCapacity,
    sourceDefaultProps:candidate.defaultProps,
    sourceControlDefinitions:candidate.controls,
    sourceCountBindingDefinitions:candidate.countBindings,
    sourceLengthBindingDefinitions:candidate.lengthBindings,
    sourcePropShapes:candidate.propShapes,
    sourceNumericBounds:candidate.numericBounds,
    sourceMediaSlotDefinitions:candidate.mediaSlots,
    migrationRequired:true,
  };
}

function buildPlan(spec) {
  let mappings=spec.archetypes.map(archetype=>({...archetype,candidates:candidates(spec,archetype)}));
  const missing=mappings.filter(item=>!item.candidates.length).map(item=>item.id);
  if(missing.length) throw new Error(`No compatible original modules found for archetypes: ${missing.join(', ')}`);
  mappings=resolveReuseFirstStrategies(spec,mappings);
  const familyWeights={};
  for(const archetype of spec.archetypes) familyWeights[archetype.family]=(familyWeights[archetype.family]||0)+Number(archetype.weight||1);
  const grammar=styleGrammar(spec);
  const observedModuleProposals=mappings.filter(item=>item.strategy!=='reuse').map((item,index)=>({
    id:`${spec.key}_signature_${item.id.replace(/[^a-z0-9]+/gi,'_')}`,
    archetypeId:item.id,
    componentName:`Signature${String(index+1).padStart(2,'0')}${item.id.split(/[^a-z0-9]+/i).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join('')}`,
    family:item.family,
    strategy:item.strategy,
    evidenceMode:'observed',
    evidenceRefs:item.referencePages,
    visualRequirements:item.notes,
    styleSignals:item.notes,
    reuseJustification:item.reuseJustification,
    sourceContract:item.strategy==='modify'?sourceContract(item.candidates[0]):null,
    preservedCapabilities:item.strategy==='modify'?preservedCapabilities(item.candidates[0]):[],
    changedStructure:item.strategy==='modify'?['page-composition']:[],
    structurePatch:item.strategy==='modify'?{kind:'layout',target:'page-composition',operation:'rebuild-from-evidence',evidenceRefs:item.referencePages}:null,
    requiredCapabilities:{editableFields:true,controls:true,writableMedia:item.needsMedia,runtimeSafe:true,contentShape:item.strategy==='modify'?item.candidates[0].fieldKeys:CONTENT_SHAPES[item.family]},
    implementationStatus:'proposed',
  }));
  const derivedModuleProposals=derivedBlueprints(spec).map((blueprint,index)=>{
    const derivedFromRules=ruleRefsFor(grammar,blueprint,index);
    const styleSignals=derivedFromRules.map(id=>grammar.rules.find(rule=>rule.id===id)?.description).filter(Boolean);
    const anchorModuleRefs=anchorRefsFor(blueprint,observedModuleProposals);
    return {
      id:`${spec.key}_derived_${blueprint.id.replace(/[^a-z0-9]+/gi,'_')}`,
      archetypeId:`derived-${blueprint.id}`,
      componentName:`Derived${String(index+1).padStart(2,'0')}${blueprint.id.split(/[^a-z0-9]+/i).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join('')}`,
      family:blueprint.family,
      strategy:'new',
      evidenceMode:'inferred',
      evidenceRefs:[],
      derivedFromRules,
      anchorModuleRefs,
      stylePrimitiveRefs:primitiveRefsFor(grammar,index),
      derivationReason:`${blueprint.intent}；以 ${anchorModuleRefs.join('、')} 为视觉锚点。`,
      visualRequirements:[blueprint.intent,...styleSignals],
      styleSignals,
      sourceContract:null,
      requiredCapabilities:{editableFields:true,controls:true,writableMedia:Boolean(blueprint.mediaCapability),runtimeSafe:true,contentShape:blueprint.contentShape},
      implementationStatus:'proposed',
    };
  });
  const ownedModuleProposals=[...observedModuleProposals,...derivedModuleProposals];
  const pinnedModules=mappings.filter(item=>item.strategy==='reuse').map(item=>({
    archetypeId:item.id,
    family:item.family,
    sourceTheme:item.candidates[0].sourceTheme,
    sourcePageKey:item.candidates[0].layout,
    reuseJustification:item.reuseJustification,
  }));
  const plan={
    schemaVersion:3,
    qualityVersion:QUALITY_VERSION,
    policyVersion:THEME_GENERATION_POLICY_VERSION,
    generationMode:spec.generationMode,
    theme:{key:spec.key,displayName:spec.displayName,scenario:spec.scenario,audience:spec.audience},
    evidence:{references:spec.references,visualEvidence:spec.visual},
    styleGrammar:grammar,
    visualImplementation:spec.implementation,
    recipe:{pageCount:spec.pageCount,sources:spec.sourceThemes,familyWeights,ownModuleMinimum:ownedModuleProposals.length,pinnedModules},
    moduleMappings:mappings,
    moduleSources:{observed:observedModuleProposals.length,inferred:derivedModuleProposals.length},
    observedModuleProposals,
    derivedModuleProposals,
    ownedModuleProposals,
    gates:[
      'Every signature visual rule is implemented in theme CSS or a theme-owned primitive.',
      'Every modify/new reference archetype has one implemented observed module with evidenceRefs.',
      'Every inferred module cites at least four Style DNA rules, two observed anchor modules, and one signature primitive without claiming direct page evidence.',
      'Theme-owned modules are composed before original-theme fallback modules in the same family.',
      'Rendered audit pages pass the palette-conformance validator for the declared paletteMode.',
      'Reused modules retain their field, control, chart, media, and runtime contracts.',
      'Modified modules document the source page and contract changes.',
      'At least one rendered audit page exists for every external reference archetype.',
      `${spec.generationMode} policy requires at least ${resolveThemeGenerationPolicy(spec.generationMode).minimumObservedModules} observed and ${resolveThemeGenerationPolicy(spec.generationMode).minimumInferredModules} inferred modules; reuse mappings pin complete original-theme page contracts into the composed library.`,
      'Every composed page passes full-library text overflow, clipping, oversized-text, and overlap validation.',
      'No reference image is shipped as a flattened slide background unless explicitly licensed and requested.',
    ],
  };
  return {...plan,planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}

const args=parseArgs(process.argv.slice(2));
if(args.help||!args.spec) {
  console.log('Usage: node scripts/prepare-external-theme.mjs --spec <external-template.json> [--out <plan.json>]');
  process.exit(args.help?0:1);
}
const raw=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),args.spec),'utf8'));
const plan=buildPlan(validate(raw));
const output=`${JSON.stringify(plan,null,2)}\n`;
if(args.out) {
  const target=path.resolve(process.cwd(),args.out);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,output);
  console.log(`Wrote ${target}`);
} else process.stdout.write(output);
