import assert from 'node:assert/strict';
import { validateThemeOwnedProvenance } from '../project/scripts/workflow/theme-owned-provenance.mjs';

const categories=['typography','composition','surface','media','motif','signature','color','forbidden'];
const rules=categories.map((category,index)=>({id:`${category}-01`,category,description:`${category} rule ${index+1}`}));
const observed=Array.from({length:8},(_,index)=>({
  id:`observed-${index+1}`,
  family:['cover','general','metrics','media','comparison','timeline','table','closing'][index],
  strategy:'new',
  evidenceMode:'observed',
  evidenceRefs:[`reference-${index+1}.png`],
  styleSignals:['type','composition','motif'],
}));
const inferredFamilies=['transition','relationship','distribution','ranking','proportion','statement','media','general'];
const inferred=inferredFamilies.map((family,index)=>({
  id:`inferred-${index+1}`,
  family,
  strategy:'new',
  evidenceMode:'inferred',
  evidenceRefs:[],
  derivedFromRules:['typography-01','composition-01',family==='media'?'media-01':'surface-01','motif-01','color-01'],
  anchorModuleRefs:[observed[index%observed.length].id,observed[(index+1)%observed.length].id],
  stylePrimitiveRefs:[`primitive-${index%4+1}`],
  derivationReason:`derive ${family} from the theme grammar`,
  styleSignals:['type','composition','surface or media','motif','color'],
  requiredCapabilities:{editableFields:true,controls:true,writableMedia:family==='media',runtimeSafe:true,contentShape:['title','items','summary']},
}));
const manifest={
  qualityVersion:3,
  moduleSources:{observed:8,inferred:8},
  styleGrammar:{rules,primitives:Array.from({length:4},(_,index)=>({id:`primitive-${index+1}`}))},
  modules:[...observed,...inferred],
};

assert.deepEqual(validateThemeOwnedProvenance(manifest),[]);

const fakeEvidence=structuredClone(manifest);
fakeEvidence.modules[8].evidenceRefs=['invented-reference.png'];
assert(validateThemeOwnedProvenance(fakeEvidence).some(error=>error.includes('must not claim direct-page evidenceRefs')));

const weakDerivation=structuredClone(manifest);
weakDerivation.modules[8].derivedFromRules=['typography-01'];
assert(validateThemeOwnedProvenance(weakDerivation).some(error=>error.includes('requires at least 4 Style DNA rule references')));

console.log('Derived module provenance validation passed.');
