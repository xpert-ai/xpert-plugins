import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  THEME_PAGES,
  getLayoutRecord,
} from './workflow/theme-registry.mjs';
import {
  getMediaSlotsForLayout,
  isWritableMediaSlot,
  mediaSlotCapacity,
} from './workflow/media-slots.mjs';
import { validateThemeOwnedProvenance } from './workflow/theme-owned-provenance.mjs';
import { resolveThemeGenerationPolicy, THEME_GENERATION_POLICY_VERSION } from './workflow/theme-generation-policy.mjs';
import { GENERATED_THEME_DEFINITIONS, GENERATED_THEME_KEYS } from '../src/components/themes/generated-theme-definitions.mjs';

const REQUIRED_MODULES = ['theme.js', 'theme.css', 'context.jsx', 'defaults.js', 'controls.js', 'charts.jsx', 'media.jsx', 'visuals.js', 'helpers.jsx', 'layouts.jsx', 'runtime.jsx'];
const REQUIRED_COMMON_MODULES = ['controls.js', 'primitives.jsx'];
const BACKGROUND_TEXTURE_MODULES = new Set(['theme.js', 'theme.css', 'visuals.js', 'helpers.jsx']);
const FORBIDDEN_BACKGROUND_TEXTURE = /repeating-(?:linear|radial)-gradient|background-size:\s*(?:18|24|48)px|background-image:\s*linear-gradient\([^;]+linear-gradient\(90deg/i;

const errors = [];
const moduleFingerprints = new Map(['theme.css', 'defaults.js', 'charts.jsx'].map(file => [file, new Set()]));
const SOURCE_DEMO_TERMS = /AI Capital|OpenAI|xAI|CoreWeave|Anthropic|Databricks|SoundWave|声浪/gi;
const ORIGINAL_THEME = /^theme(?:0[1-9]|1[0-2])$/;

function fail(message) {
  errors.push(message);
}

function leafCount(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.reduce((sum,item)=>sum+leafCount(item),0);
  if (typeof value === 'object') return Object.values(value).reduce((sum,item)=>sum+leafCount(item),0);
  return 1;
}

function arrayCount(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return 1+value.reduce((sum,item)=>sum+arrayCount(item),0);
  if (typeof value === 'object') return Object.values(value).reduce((sum,item)=>sum+arrayCount(item),0);
  return 0;
}

function contentStrings(value,out=[]) {
  if (Array.isArray(value)) value.forEach(item=>contentStrings(item,out));
  else if (value&&typeof value==='object') Object.values(value).forEach(item=>contentStrings(item,out));
  else if (typeof value==='string'&&value.trim()&&!/^(?:#|assets\/)/.test(value)) out.push(value);
  return out;
}

for (const file of REQUIRED_COMMON_MODULES) {
  if (!existsSync(path.join(ROOT, 'src/components/themes/generated-theme-common', file))) {
    fail(`shared authoring kernel: missing ${file}`);
  }
}
const factorySource = readFileSync(path.join(ROOT, 'src/components/themes/generated-theme-factory.jsx'), 'utf8');
const baselineAdapterSource = readFileSync(path.join(ROOT, 'src/components/themes/generated-theme-baseline-adapter.jsx'), 'utf8');
if (FORBIDDEN_BACKGROUND_TEXTURE.test(baselineAdapterSource)) fail('baseline adapter reintroduces a tiled grid, dot, or scanline background');
for (const file of REQUIRED_COMMON_MODULES) {
  if (!factorySource.includes(`./generated-theme-common/${file}`)) fail(`shared authoring kernel: ${file} is not consumed by the factory`);
}

for (const themeKey of GENERATED_THEME_KEYS) {
  const definition=GENERATED_THEME_DEFINITIONS.find(theme=>theme.key===themeKey);
  const definitionQualityVersion=Number(definition?.profile?.qualityVersion);
  if(definitionQualityVersion>=3&&!definition?.profile?.generationMode) fail(`${themeKey}: quality v3 definition must explicitly declare generationMode`);
  if(definitionQualityVersion>=3&&!definition?.recipe?.generationMode) fail(`${themeKey}: quality v3 recipe must explicitly declare generationMode`);
  if(definitionQualityVersion>=3&&!definition?.profile?.policyVersion) fail(`${themeKey}: quality v3 definition must explicitly declare policyVersion`);
  if(definitionQualityVersion>=3&&!definition?.recipe?.policyVersion) fail(`${themeKey}: quality v3 recipe must explicitly declare policyVersion`);
  const generationPolicy=resolveThemeGenerationPolicy(definition?.profile?.generationMode);
  if(Number(definition?.profile?.policyVersion)!==THEME_GENERATION_POLICY_VERSION||Number(definition?.recipe?.policyVersion)!==THEME_GENERATION_POLICY_VERSION) fail(`${themeKey}: definition and recipe policyVersion must match generator policy ${THEME_GENERATION_POLICY_VERSION}`);
  if(definition?.recipe?.generationMode&&definition.recipe.generationMode!==generationPolicy.generationMode) fail(`${themeKey}: recipe generationMode ${definition.recipe.generationMode} does not match definition generationMode ${generationPolicy.generationMode}`);
  if(!['adaptive','strict'].includes(definition?.profile?.paletteMode)) fail(`${themeKey}: profile must declare adaptive or strict paletteMode`);
  for (const file of REQUIRED_MODULES) {
    const modulePath = path.join(ROOT, 'src/components/themes', themeKey, file);
    if (!existsSync(modulePath)) {
      fail(`${themeKey}: missing independent authoring module ${file}`);
    } else if (moduleFingerprints.has(file)) {
      moduleFingerprints.get(file).add(readFileSync(modulePath, 'utf8'));
    }
    if (existsSync(modulePath)&&BACKGROUND_TEXTURE_MODULES.has(file)&&FORBIDDEN_BACKGROUND_TEXTURE.test(readFileSync(modulePath,'utf8'))) {
      fail(`${themeKey}: ${file} reintroduces a tiled grid, dot, or scanline background`);
    }
  }
  const contextSource = readFileSync(path.join(ROOT, 'src/components/themes', themeKey, 'context.jsx'), 'utf8');
  const layoutSource = readFileSync(path.join(ROOT, 'src/components/themes', themeKey, 'layouts.jsx'), 'utf8');
  const sourceMatch=layoutSource.match(/export const sourceThemes = (\[[^;]+\])/);
  if (!sourceMatch) fail(`${themeKey}: missing declared original-theme module sources`);
  if (!contextSource.includes('React.createContext') || !contextSource.includes('ThemeProvider')) fail(`${themeKey}: Context module is not active`);
  for (const dependency of ['./context.jsx', './defaults.js', './controls.js', './charts.jsx', './media.jsx', './visuals.js', './helpers.jsx']) {
    if (!layoutSource.includes(dependency)) fail(`${themeKey}: layouts module does not assemble ${dependency}`);
  }
  const pages = THEME_PAGES.filter(page => page.themeKey === themeKey);
  const expectedPageCount=definition?.recipe?.pageCount;
  if (!Number.isInteger(expectedPageCount)||expectedPageCount<76||expectedPageCount>96) fail(`${themeKey}: recipe page count must stay within 76-96`);
  if (pages.length !== expectedPageCount) fail(`${themeKey}: expected ${expectedPageCount} recipe pages, found ${pages.length}`);
  const pageSources=new Set(pages.map(page=>page.sourceTheme).filter(Boolean));
  const selectedOriginalSources=new Set([...pageSources].filter(source=>ORIGINAL_THEME.test(source)));
  if(selectedOriginalSources.size<2) fail(`${themeKey}: composed library must use at least two original theme sources`);
  for(const source of selectedOriginalSources) if(!definition.recipe.sources.includes(source)) fail(`${themeKey}: undeclared original module source ${source}`);
  for(const source of pageSources) if(!ORIGINAL_THEME.test(source)&&source!==themeKey) fail(`${themeKey}: invalid theme-owned module source ${source}`);
  if(pageSources.has(themeKey)&&!definition.ownModules) fail(`${themeKey}: theme-owned pages are present without an ownModules declaration`);

  if(definition.ownModules) {
    const themeDir=path.join(ROOT,'src/components/themes',themeKey);
    const modulePath=path.join(themeDir,definition.ownModules.module.replace(/^\.\//,''));
    const manifestPath=path.join(themeDir,definition.ownModules.manifest.replace(/^\.\//,''));
    if(!existsSync(modulePath)) fail(`${themeKey}: missing theme-owned module source ${definition.ownModules.module}`);
    if(!existsSync(manifestPath)) fail(`${themeKey}: missing theme-owned module manifest ${definition.ownModules.manifest}`);
    if(!layoutSource.includes(definition.ownModules.module)) fail(`${themeKey}: layouts do not import the declared theme-owned module source`);
    if(existsSync(manifestPath)) {
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
      const declared=manifest.modules||[];
      const ownPages=pages.filter(page=>page.sourceTheme===themeKey);
      const minimum=Number(definition.ownModules.minimum)||1;
      const qualityVersion=Number(manifest.qualityVersion||definition.profile?.qualityVersion||1);
      const generationMode=manifest.generationMode||definition.profile?.generationMode;
      const ownedPolicy=resolveThemeGenerationPolicy(generationMode);
      if(qualityVersion>=3&&!manifest.generationMode) fail(`${themeKey}: quality v3 manifest must explicitly declare generationMode`);
      if(qualityVersion>=3&&!manifest.policyVersion) fail(`${themeKey}: quality v3 manifest must explicitly declare policyVersion`);
      if(Number(manifest.policyVersion)!==THEME_GENERATION_POLICY_VERSION) fail(`${themeKey}: manifest policyVersion does not match generator policy ${THEME_GENERATION_POLICY_VERSION}`);
      if(manifest.planDigest&&definition.recipe?.planDigest&&manifest.planDigest!==definition.recipe.planDigest) fail(`${themeKey}: manifest planDigest does not match the registered recipe`);
      if(ownedPolicy.generationMode!==generationPolicy.generationMode) fail(`${themeKey}: manifest generationMode ${ownedPolicy.generationMode} does not match definition generationMode ${generationPolicy.generationMode}`);
      if(qualityVersion===2&&minimum<8) fail(`${themeKey}: quality v2 requires an ownModules minimum of at least 8`);
      if(qualityVersion>=3&&minimum<ownedPolicy.minimumOwnedModules) fail(`${themeKey}: ${ownedPolicy.generationMode} requires an ownModules minimum of at least ${ownedPolicy.minimumOwnedModules}`);
      if(ownPages.length<minimum) fail(`${themeKey}: expected at least ${minimum} selected theme-owned modules, found ${ownPages.length}`);
      if(declared.length<minimum) fail(`${themeKey}: manifest declares only ${declared.length} theme-owned modules`);
      for(const error of validateThemeOwnedProvenance(manifest,{qualityVersion,generationMode})) fail(`${themeKey}: ${error}`);
      const declaredIds=new Set(declared.map(item=>item.id));
      const selectedIds=new Set(ownPages.map(page=>page.sourcePageKey));
      for(const item of declared) {
        if(item.implementationStatus!=='implemented') fail(`${themeKey}: ${item.id} is still ${item.implementationStatus||'unimplemented'}`);
        if(item.strategy==='modify') {
          const sourceKey=item.sourceContract?.sourcePageKey;
          if(!sourceKey) fail(`${themeKey}: ${item.id} modify strategy lacks a source contract`);
          else {
            const sourceRecord=getLayoutRecord(sourceKey);
            if(!sourceRecord) fail(`${themeKey}: ${item.id} source contract points to unknown page ${sourceKey}`);
            else {
              const actualFields=Object.keys(sourceRecord.defaultProps||{}).sort();
              const declaredFields=[...(item.sourceContract?.sourceFields||[])].sort();
              const actualControls=(sourceRecord.controls||[]).map(control=>control.key).filter(Boolean).sort();
              const declaredControls=[...(item.sourceContract?.sourceControls||[])].sort();
              if(JSON.stringify(actualFields)!==JSON.stringify(declaredFields)) fail(`${themeKey}: ${item.id} source field inventory drifted from ${sourceKey}`);
              if(JSON.stringify(actualControls)!==JSON.stringify(declaredControls)) fail(`${themeKey}: ${item.id} source control inventory drifted from ${sourceKey}`);
            }
          }
          if(!Array.isArray(item.sourceContract?.sourceFields)||!item.sourceContract.sourceFields.length) fail(`${themeKey}: ${item.id} source contract lacks exact source fields`);
          if(!Array.isArray(item.sourceContract?.sourceControls)) fail(`${themeKey}: ${item.id} source contract lacks exact source controls`);
          if(!Array.isArray(item.preservedCapabilities)||!item.preservedCapabilities.length) fail(`${themeKey}: ${item.id} does not declare preserved capabilities`);
          if(!Array.isArray(item.changedStructure)||!item.changedStructure.length) fail(`${themeKey}: ${item.id} does not declare structural changes`);
        }
      }
      for(const id of declaredIds) if(!selectedIds.has(id)) fail(`${themeKey}: declared theme-owned module ${id} was not selected into the page library`);
      for(const page of ownPages) {
        if(!declaredIds.has(page.sourcePageKey)) fail(`${themeKey}: selected theme-owned module ${page.sourcePageKey} is absent from the manifest`);
        if(page.moduleOrigin!=='owned') fail(`${page.key}: theme-owned page lost moduleOrigin provenance`);
        if(!['modify','new'].includes(page.moduleStrategy)) fail(`${page.key}: invalid theme-owned module strategy`);
        if(!page.archetypeId) fail(`${page.key}: theme-owned page lacks archetype provenance`);
        const declaredModule=declared.find(item=>item.id===page.sourcePageKey);
        const evidenceMode=declaredModule?.evidenceMode||'observed';
        if(evidenceMode==='observed'&&!page.evidenceRefs?.length) fail(`${page.key}: observed module lost direct evidenceRefs`);
        const record=getLayoutRecord(page.key);
        const contentShape=declaredModule?.requiredCapabilities?.contentShape||[];
        const missingFields=contentShape.filter(field=>!Object.prototype.hasOwnProperty.call(record?.defaultProps||{},field));
        if(missingFields.length) fail(`${page.key}: owned module is missing declared editable fields ${missingFields.join(', ')}; regenerate its typed defaults before implementing JSX`);
        if(declaredModule?.requiredCapabilities?.controls&&!(record?.controls||[]).length) fail(`${page.key}: owned module declares controls but exposes none`);
        if(declaredModule?.requiredCapabilities?.writableMedia&&!getMediaSlotsForLayout(page.key).some(isWritableMediaSlot)) fail(`${page.key}: owned module declares writable media but exposes no writable media slot`);
        if(evidenceMode==='inferred') {
          if(page.evidenceMode!=='inferred') fail(`${page.key}: inferred module lost evidenceMode provenance`);
          if(page.evidenceRefs?.length) fail(`${page.key}: inferred module claims direct evidenceRefs`);
          if(JSON.stringify(page.derivedFromRules||[])!==JSON.stringify(declaredModule?.derivedFromRules||[])) fail(`${page.key}: inferred module Style DNA provenance drifted from its manifest`);
          if(JSON.stringify(page.anchorModuleRefs||[])!==JSON.stringify(declaredModule?.anchorModuleRefs||[])) fail(`${page.key}: inferred module anchor provenance drifted from its manifest`);
        }
        if(declaredModule&&declaredModule.family!==page.moduleFamily) fail(`${page.key}: manifest family ${declaredModule.family} does not match runtime family ${page.moduleFamily}; set signaturePages.moduleFamily explicitly to the manifest family`);
        if(declaredModule?.strategy==='modify') {
          if(page.sourceContract?.sourcePageKey!==declaredModule.sourceContract?.sourcePageKey) fail(`${page.key}: runtime source contract does not match its manifest`);
          const runtimeFields=new Set(Object.keys(record?.defaultProps||{}));
          const runtimeControls=new Set((record?.controls||[]).map(control=>control.key).filter(Boolean));
          const lostFields=(declaredModule.sourceContract?.sourceFields||[]).filter(field=>!runtimeFields.has(field));
          const lostControls=(declaredModule.sourceContract?.sourceControls||[]).filter(key=>!runtimeControls.has(key));
          if(lostFields.length) fail(`${page.key}: modify module dropped source fields ${lostFields.join(', ')}`);
          if(lostControls.length) fail(`${page.key}: modify module dropped source controls ${lostControls.join(', ')}`);
          const runtimeMedia=getMediaSlotsForLayout(page.key).filter(isWritableMediaSlot).length;
          if(runtimeMedia<Number(declaredModule.sourceContract?.sourceMediaSlots||0)) fail(`${page.key}: modify module preserved only ${runtimeMedia} writable media slots from ${declaredModule.sourceContract.sourceMediaSlots}`);
        }
      }
      const ownedFamilies=new Set(ownPages.map(page=>page.moduleFamily));
      const familyFloor=qualityVersion>=3?ownedPolicy.minimumOwnedFamilies:qualityVersion>=2?6:4;
      if(ownedFamilies.size<familyFloor) fail(`${themeKey}: theme-owned modules cover only ${ownedFamilies.size} structural families; quality v${qualityVersion} requires ${familyFloor}`);
    }
  }
  const moduleFamilies=new Set(pages.map(page=>page.moduleFamily).filter(Boolean));
  if(moduleFamilies.size<9) fail(`${themeKey}: module composition covers only ${moduleFamilies.size} structural families`);

  if (new Set(pages.map(page=>page.slot)).size !== pages.length) fail(`${themeKey}: structural slots must remain unique`);
  const records=pages.map(page=>getLayoutRecord(page.key));
  const averageLeaves=records.reduce((sum,record)=>sum+leafCount(record.defaultProps),0)/Math.max(1,records.length);
  const averageArrays=records.reduce((sum,record)=>sum+arrayCount(record.defaultProps),0)/Math.max(1,records.length);
  if (averageLeaves < generationPolicy.minimumAverageLeaves) fail(`${themeKey}: field richness ${averageLeaves.toFixed(1)} is below the ${generationPolicy.generationMode} floor of ${generationPolicy.minimumAverageLeaves}; pin richer original components or add real editable fields to owned modules`);
  if (averageArrays < generationPolicy.minimumAverageArrays) fail(`${themeKey}: structural array depth ${averageArrays.toFixed(1)} is below the ${generationPolicy.generationMode} floor of ${generationPolicy.minimumAverageArrays}; reuse array-driven original components or implement real repeated structures`);
  const authoredStrings=records.flatMap(record=>contentStrings(record.defaultProps?.copy??record.defaultProps));
  const uniqueAuthoredStrings=new Set(authoredStrings);
  const contentDiversity=uniqueAuthoredStrings.size/Math.max(1,authoredStrings.length);
  if (uniqueAuthoredStrings.size < 150 || contentDiversity < 0.18) fail(`${themeKey}: themed default content is too repetitive (${uniqueAuthoredStrings.size} unique strings, ${(contentDiversity*100).toFixed(1)}%)`);
  const leakedDemoTerms=records.flatMap(record=>JSON.stringify(record.defaultProps).match(SOURCE_DEMO_TERMS)||[]);
  if (leakedDemoTerms.length) fail(`${themeKey}: source-theme demo content leaked into themed defaults (${[...new Set(leakedDemoTerms)].join(', ')})`);

  let mediaCapacity = 0;
  let writableMediaPages=0;
  for (const page of pages) {
    const writable = getMediaSlotsForLayout(page.key).filter(isWritableMediaSlot);
    if (!writable.length) continue;
    writableMediaPages+=1;
    const media = writable[0];
    mediaCapacity = Math.max(mediaCapacity, mediaSlotCapacity(media));
    if (media.canPresetMedia !== true) fail(`${page.key}: media slot is not preset-writable`);
    if (!media.acceptedKinds?.includes('image')) fail(`${page.key}: media slot must accept images`);
  }
  if (writableMediaPages < 5) fail(`${themeKey}: expected at least five writable media layouts, found ${writableMediaPages}`);
  if (mediaCapacity < 3) fail(`${themeKey}: no media layout can accept three assets`);
  const controlTypes=new Set(records.flatMap(record=>record.controls.map(control=>control.type)));
  for (const type of ['range','select','toggle']) if (!controlTypes.has(type)) fail(`${themeKey}: missing ${type} authoring controls`);
  if (!records.some(record=>record.countBindings.length)) fail(`${themeKey}: missing count-bound rich structures`);

  for (const suffix of [
    `dist/theme-runtime/${themeKey}.module.mjs`,
    `dist/theme-runtime/imported-theme-runtime.${themeKey}.js`,
  ]) {
    if (!existsSync(path.join(ROOT, suffix))) fail(`${themeKey}: missing prebuilt runtime ${suffix}`);
  }
}

for (const [file, fingerprints] of moduleFingerprints) {
  if (fingerprints.size !== GENERATED_THEME_KEYS.length) {
    fail(`${file}: expected ${GENERATED_THEME_KEYS.length} theme-specific variants, found ${fingerprints.size}`);
  }
}
if (errors.length) {
  console.error(`Generated theme capability validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const pageCount=GENERATED_THEME_KEYS.reduce((sum,key)=>sum+THEME_PAGES.filter(page=>page.themeKey===key).length,0);
  console.log(`Generated theme capability validation passed: ${GENERATED_THEME_KEYS.length} themes, ${pageCount} baseline-parity layouts with rich fields and writable media.`);
}
