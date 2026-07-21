import { resolveThemeGenerationPolicy } from './theme-generation-policy.mjs';

const REQUIRED_DERIVED_CATEGORIES=[
  ['typography'],
  ['composition'],
  ['surface','media'],
  ['motif','signature'],
];

export function validateThemeOwnedProvenance(manifest,{qualityVersion=Number(manifest?.qualityVersion)||1,generationMode=manifest?.generationMode}={}) {
  const errors=[];
  const policy=resolveThemeGenerationPolicy(generationMode);
  const modules=manifest?.modules||[];
  const grammar=manifest?.styleGrammar||{};
  const rules=new Map((grammar.rules||[]).map(rule=>[rule.id,rule]));
  const primitives=new Set((grammar.primitives||[]).map(item=>item.id));
  const modeOf=item=>item.evidenceMode||'observed';
  const observed=modules.filter(item=>modeOf(item)==='observed');
  const inferred=modules.filter(item=>modeOf(item)==='inferred');
  const observedIds=new Set(observed.map(item=>item.id));

  if(qualityVersion>=3) {
    if(observed.length<policy.minimumObservedModules) errors.push(`${policy.generationMode} requires at least ${policy.minimumObservedModules} observed modules; found ${observed.length}`);
    if(observed.length>policy.maximumObservedModules) errors.push(`${policy.generationMode} allows at most ${policy.maximumObservedModules} observed modules; found ${observed.length}`);
    if(inferred.length<policy.minimumInferredModules) errors.push(`${policy.generationMode} requires at least ${policy.minimumInferredModules} inferred modules; found ${inferred.length}`);
    if(rules.size<policy.minimumStyleRules) errors.push(`${policy.generationMode} requires a compiled Style DNA grammar with at least ${policy.minimumStyleRules} rules; found ${rules.size}`);
    if(primitives.size<policy.minimumSignaturePrimitives) errors.push(`${policy.generationMode} requires at least ${policy.minimumSignaturePrimitives} signature primitives; found ${primitives.size}`);
    if(Number(manifest?.moduleSources?.observed)!==observed.length) errors.push(`moduleSources.observed does not match ${observed.length} declared observed modules`);
    if(Number(manifest?.moduleSources?.inferred)!==inferred.length) errors.push(`moduleSources.inferred does not match ${inferred.length} declared inferred modules`);
    const families=new Set(modules.map(item=>item.family).filter(Boolean));
    if(families.size<policy.minimumOwnedFamilies) errors.push(`${policy.generationMode} requires at least ${policy.minimumOwnedFamilies} theme-owned families; found ${families.size}`);
  }

  for(const item of modules) {
    const mode=modeOf(item);
    if(qualityVersion>=3&&!item.evidenceMode) errors.push(`${item.id}: quality v3 requires an explicit evidenceMode`);
    if(!['observed','inferred'].includes(mode)) {
      errors.push(`${item.id}: evidenceMode must be observed or inferred`);
      continue;
    }
    if(mode==='observed') {
      if(!Array.isArray(item.evidenceRefs)||!item.evidenceRefs.length) errors.push(`${item.id}: observed module lacks external-template evidenceRefs`);
      const signalMinimum=qualityVersion>=3?policy.minimumObservedStyleSignals:3;
      if(qualityVersion>=2&&(!Array.isArray(item.styleSignals)||item.styleSignals.length<signalMinimum)) errors.push(`${item.id}: observed module must declare at least ${signalMinimum} evidence-backed styleSignals`);
      continue;
    }
    if(Array.isArray(item.evidenceRefs)&&item.evidenceRefs.length) errors.push(`${item.id}: inferred module must not claim direct-page evidenceRefs`);
    if(!Array.isArray(item.derivedFromRules)||item.derivedFromRules.length<4) errors.push(`${item.id}: inferred module requires at least 4 Style DNA rule references`);
    if(!Array.isArray(item.anchorModuleRefs)||item.anchorModuleRefs.length<2) errors.push(`${item.id}: inferred module requires at least 2 observed anchor modules`);
    if(!String(item.derivationReason||'').trim()) errors.push(`${item.id}: inferred module requires a derivationReason`);
    if(!Array.isArray(item.styleSignals)||item.styleSignals.length<4) errors.push(`${item.id}: inferred module must declare at least 4 styleSignals`);
    if(!Array.isArray(item.stylePrimitiveRefs)||!item.stylePrimitiveRefs.length) errors.push(`${item.id}: inferred module requires at least 1 signature primitive`);
    if(!Array.isArray(item.requiredCapabilities?.contentShape)||item.requiredCapabilities.contentShape.length<3) errors.push(`${item.id}: inferred module requires a contentShape with at least 3 editable fields`);
    for(const id of item.derivedFromRules||[]) if(!rules.has(id)) errors.push(`${item.id}: unknown Style DNA rule ${id}`);
    for(const id of item.anchorModuleRefs||[]) if(!observedIds.has(id)) errors.push(`${item.id}: anchor ${id} is not an observed module`);
    for(const id of item.stylePrimitiveRefs||[]) if(!primitives.has(id)) errors.push(`${item.id}: unknown signature primitive ${id}`);
    const categories=new Set((item.derivedFromRules||[]).map(id=>rules.get(id)?.category).filter(Boolean));
    for(const choices of REQUIRED_DERIVED_CATEGORIES) if(!choices.some(category=>categories.has(category))) errors.push(`${item.id}: Style DNA rules must include ${choices.join(' or ')}`);
  }
  return errors;
}
