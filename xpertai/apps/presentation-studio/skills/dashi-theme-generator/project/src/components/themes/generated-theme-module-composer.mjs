export const MODULE_FAMILIES = [
  'cover','transition','metrics','comparison','timeline','relationship',
  'distribution','ranking','proportion','table','media','statement','closing','general',
];

const FAMILY_PATTERNS = [
  ['cover',/cover|opening|封面|开场/],
  ['closing',/closing|conclusion|endcap|appendix|contact|thank|结论|收束|封底|附录/],
  ['transition',/chapter|section|transition|divider|interlude|章节|过渡|分隔/],
  ['metrics',/metric|stat|kpi|score|number|dashboard|overview|summary|指标|数字|总览|概览/],
  ['comparison',/compare|comparison|versus|split|quadrant|matrix|swot|dumbbell|benchmark|对比|比较|象限|矩阵/],
  ['timeline',/timeline|roadmap|milestone|gantt|path|journey|steps|stage|时间|路线|里程碑|路径|阶段/],
  ['relationship',/network|graph|flow|map|orbit|constellation|nexus|ecosystem|relation|关系|网络|生态|流向|图谱/],
  ['distribution',/stack|distribution|share|mix|segment|funnel|waterfall|mekko|waffle|构成|分布|占比|漏斗|瀑布/],
  ['ranking',/rank|ranking|bar|column|lollipop|slope|trend|growth|line|area|排行|排名|趋势|增长|柱图|折线/],
  ['proportion',/donut|pie|radar|gauge|dial|arc|polar|比例|环图|饼图|雷达|仪表|能力/],
  ['table',/table|list|agenda|contents|catalog|index|risk|ledger|表格|清单|目录|风险|议程/],
  ['media',/media|image|gallery|collage|filmstrip|spotlight|showcase|case|portrait|profile|editorial|图文|图片|画廊|案例|人物|媒体/],
  ['statement',/quote|statement|claim|manifesto|message|引语|观点|宣言/],
];

const DEFAULT_WEIGHTS = {
  transition:3, metrics:11, comparison:8, timeline:8, relationship:7,
  distribution:8, ranking:9, proportion:6, table:8, media:10, statement:5, general:17,
};

const SOURCE_STRENGTHS = {
  theme01:['cover','transition','metrics','comparison','timeline','media','statement','general'],
  theme02:['cover','metrics','timeline','media','comparison','general'],
  theme03:['cover','timeline','relationship','comparison','media','general'],
  theme04:['cover','comparison','media','metrics','general'],
  theme05:['metrics','comparison','distribution','ranking','proportion','table','media'],
  theme06:['metrics','comparison','timeline','relationship','distribution','table','ranking'],
  theme07:['comparison','timeline','table','statement','media','general'],
  theme08:['cover','metrics','comparison','media','statement'],
  theme09:['cover','transition','timeline','media','statement','table','general'],
  theme10:['metrics','comparison','distribution','ranking','proportion','table'],
  theme11:['metrics','timeline','distribution','ranking','comparison','general'],
  theme12:['cover','transition','metrics','timeline','media','statement','general'],
};

// These original modules rely on text boxes whose fixed height/width cannot
// safely accommodate rethemed copy. Keep them in their source themes, but do
// not compose them into generated themes until their source contracts change.
const GENERATED_THEME_INCOMPATIBLE_SOURCE_PAGES = new Set([
  'theme09_page072',
]);

export function moduleFamily(page) {
  if(MODULE_FAMILIES.includes(page.moduleFamily)) return page.moduleFamily;
  const text=[page.slot,page.label,...(page.roles||[])].filter(Boolean).join(' ').toLowerCase();
  return FAMILY_PATTERNS.find(([,pattern])=>pattern.test(text))?.[0]||'general';
}

export function normalizeThemeRecipe(recipe={}) {
  const pageCount=Math.max(76,Math.min(96,Number(recipe.pageCount)||84));
  const sources=[...new Set((recipe.sources||[]).map(String))];
  if(!sources.length) throw new Error('A generated theme recipe must contain at least one original source theme');
  const pinnedModules=(recipe.pinnedModules||[]).map((item,index)=>{
    const sourceTheme=String(item?.sourceTheme||'');
    const sourcePageKey=String(item?.sourcePageKey||'');
    if(!sources.includes(sourceTheme)||!sourcePageKey) throw new Error(`Pinned module ${index} must identify a page from a declared source theme`);
    return {...item,sourceTheme,sourcePageKey};
  });
  if(new Set(pinnedModules.map(item=>`${item.sourceTheme}:${item.sourcePageKey}`)).size!==pinnedModules.length) throw new Error('Pinned modules must identify unique source pages');
  const capabilityTargets={
    minimumAverageLeaves:Math.max(0,Number(recipe.capabilityTargets?.minimumAverageLeaves)||0),
    minimumAverageArrays:Math.max(0,Number(recipe.capabilityTargets?.minimumAverageArrays)||0),
  };
  return {pageCount,sources,pinnedModules,capabilityTargets,familyWeights:{...DEFAULT_WEIGHTS,...(recipe.familyWeights||{})}};
}

function stableHash(value) {
  let hash=2166136261;
  for(const char of String(value)) hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return hash>>>0;
}

function allocateFamilies(count,weights) {
  const entries=Object.entries(weights).filter(([,weight])=>Number(weight)>0);
  const total=entries.reduce((sum,[,weight])=>sum+Number(weight),0)||1;
  const raw=entries.map(([family,weight])=>({family,raw:count*Number(weight)/total}));
  const allocation=Object.fromEntries(raw.map(item=>[item.family,Math.floor(item.raw)]));
  let remaining=count-Object.values(allocation).reduce((sum,value)=>sum+value,0);
  raw.sort((a,b)=>(b.raw-Math.floor(b.raw))-(a.raw-Math.floor(a.raw))||a.family.localeCompare(b.family));
  for(let index=0;remaining>0;index+=1,remaining-=1) allocation[raw[index%raw.length].family]+=1;
  return allocation;
}

function candidateScore(entry,family,recipe,seed) {
  if(entry.pinned) return -3e9+(stableHash(`${seed}:pinned:${family}:${entry.page.key}`)%1e7);
  if(entry.kind==='owned') return -2e9+(stableHash(`${seed}:owned:${family}:${entry.page.key}`)%1e7);
  const sourceIndex=recipe.sources.indexOf(entry.sourceTheme);
  const strength=(SOURCE_STRENGTHS[entry.sourceTheme]||[]).includes(family)?0:1;
  const metrics=pageCapabilityMetrics(entry.page);
  const capabilityScore=metrics.leaves*20000+metrics.arrays*160000+metrics.controls*5000;
  return strength*1e9+sourceIndex*1e7-capabilityScore+(stableHash(`${seed}:${family}:${entry.page.key}`)%1e6);
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

function pageCapabilityMetrics(page) {
  return {leaves:leafCount(page.defaultProps),arrays:arrayCount(page.defaultProps),controls:(page.controls||[]).length};
}

function averageCapability(entries) {
  const metrics=entries.map(entry=>pageCapabilityMetrics(entry.page));
  return {
    leaves:metrics.reduce((sum,item)=>sum+item.leaves,0)/Math.max(1,metrics.length),
    arrays:metrics.reduce((sum,item)=>sum+item.arrays,0)/Math.max(1,metrics.length),
  };
}

function optimizeCapabilityRichness(selected,catalog,recipe,themeKey) {
  const target=recipe.capabilityTargets;
  if(!target.minimumAverageLeaves&&!target.minimumAverageArrays) return selected;
  const next=[...selected];
  const keyOf=entry=>`${entry.sourceTheme}:${entry.page.key}`;
  const satisfies=metrics=>metrics.leaves>=target.minimumAverageLeaves&&metrics.arrays>=target.minimumAverageArrays;
  let metrics=averageCapability(next);
  while(!satisfies(metrics)) {
    const used=new Set(next.map(keyOf));
    let best=null;
    for(let index=0;index<next.length;index+=1) {
      const current=next[index];
      if(current.kind==='owned'||current.pinned) continue;
      const currentMetrics=pageCapabilityMetrics(current.page);
      for(const candidate of catalog) {
        if(candidate.kind==='owned'||candidate.pinned||candidate.family!==current.family||used.has(keyOf(candidate))) continue;
        const candidateMetrics=pageCapabilityMetrics(candidate.page);
        const leavesGain=candidateMetrics.leaves-currentMetrics.leaves;
        const arraysGain=candidateMetrics.arrays-currentMetrics.arrays;
        const gain=(metrics.leaves<target.minimumAverageLeaves?leavesGain*10:0)+(metrics.arrays<target.minimumAverageArrays?arraysGain*100:0);
        if(gain<=0) continue;
        if(!best||gain>best.gain||(gain===best.gain&&keyOf(candidate).localeCompare(keyOf(best.candidate))<0)) best={index,candidate,gain};
      }
    }
    if(!best) break;
    next[best.index]=best.candidate;
    metrics=averageCapability(next);
  }
  if(!satisfies(metrics)) throw new Error(`${themeKey}: composed capability richness ${metrics.leaves.toFixed(1)} leaves / ${metrics.arrays.toFixed(2)} arrays cannot reach ${target.minimumAverageLeaves} / ${target.minimumAverageArrays}; replace the weakest owned module with a typed blueprint or add richer declared source themes`);
  return next;
}

export function composeThemeModules(definition,libraries) {
  const recipe=normalizeThemeRecipe(definition.recipe);
  const pinnedKeys=new Set(recipe.pinnedModules.map(item=>`${item.sourceTheme}:${item.sourcePageKey}`));
  const catalog=libraries.flatMap(library=>library.pages.filter(page=>library.kind==='owned'||!GENERATED_THEME_INCOMPATIBLE_SOURCE_PAGES.has(page.key)).map(page=>({
    sourceTheme:library.themeKey,
    kind:library.kind||'original',
    page,
    family:moduleFamily(page),
    pinned:pinnedKeys.has(`${library.themeKey}:${page.key}`),
  })));
  const foundPinned=new Set(catalog.filter(entry=>entry.pinned).map(entry=>`${entry.sourceTheme}:${entry.page.key}`));
  const unknownPinned=[...pinnedKeys].filter(key=>!foundPinned.has(key));
  if(unknownPinned.length) throw new Error(`${definition.key}: pinned original modules were not found: ${unknownPinned.join(', ')}`);
  const selected=[];
  const used=new Set();
  const owned=catalog.filter(entry=>entry.kind==='owned');
  const mandatoryMinimums=Object.fromEntries(MODULE_FAMILIES.map(family=>[family,catalog.filter(entry=>entry.family===family&&(entry.kind==='owned'||entry.pinned)).length]));
  const take=(family,count)=>{
    const candidates=catalog.filter(entry=>entry.family===family&&!used.has(`${entry.sourceTheme}:${entry.page.key}`))
      .sort((a,b)=>candidateScore(a,family,recipe,definition.key)-candidateScore(b,family,recipe,definition.key));
    for(const entry of candidates.slice(0,count)) {
      used.add(`${entry.sourceTheme}:${entry.page.key}`);
      selected.push(entry);
    }
  };
  const coverCount=Math.max(Math.min(5,recipe.pageCount),mandatoryMinimums.cover||0);
  const closingCount=Math.max(recipe.pageCount>8?2:1,mandatoryMinimums.closing||0);
  const mandatoryBodyCount=Object.entries(mandatoryMinimums).filter(([family])=>!['cover','closing'].includes(family)).reduce((sum,[,count])=>sum+count,0);
  const bodyCapacity=recipe.pageCount-coverCount-closingCount;
  if(bodyCapacity<mandatoryBodyCount) throw new Error(`${definition.key}: ${owned.length} theme-owned and ${pinnedKeys.size} pinned modules cannot fit the ${recipe.pageCount}-page recipe`);
  take('cover',coverCount);
  const bodyWeights=Object.fromEntries(Object.entries(recipe.familyWeights).filter(([family])=>!['cover','closing'].includes(family)));
  const extraAllocation=allocateFamilies(bodyCapacity-mandatoryBodyCount,bodyWeights);
  const allocation=Object.fromEntries(Object.keys(bodyWeights).map(family=>[family,(mandatoryMinimums[family]||0)+(extraAllocation[family]||0)]));
  for(const family of Object.keys(bodyWeights)) take(family,allocation[family]||0);
  if(selected.length<recipe.pageCount-closingCount) {
    const fallback=catalog.filter(entry=>!['cover','closing'].includes(entry.family)&&!used.has(`${entry.sourceTheme}:${entry.page.key}`))
      .sort((a,b)=>stableHash(`${definition.key}:${a.sourceTheme}:${a.page.key}`)-stableHash(`${definition.key}:${b.sourceTheme}:${b.page.key}`));
    for(const entry of fallback.slice(0,recipe.pageCount-closingCount-selected.length)) selected.push(entry);
  }
  take('closing',closingCount);
  if(selected.length<recipe.pageCount) {
    const tail=catalog.filter(entry=>!used.has(`${entry.sourceTheme}:${entry.page.key}`));
    selected.push(...tail.slice(0,recipe.pageCount-selected.length));
  }
  if(selected.length!==recipe.pageCount) throw new Error(`${definition.key}: recipe requested ${recipe.pageCount} modules but only ${selected.length} could be composed`);
  const missingOwned=owned.filter(entry=>!used.has(`${entry.sourceTheme}:${entry.page.key}`));
  if(missingOwned.length) throw new Error(`${definition.key}: theme-owned modules were not selected: ${missingOwned.map(entry=>entry.page.key).join(', ')}`);
  const missingPinned=catalog.filter(entry=>entry.pinned&&!used.has(`${entry.sourceTheme}:${entry.page.key}`));
  if(missingPinned.length) throw new Error(`${definition.key}: pinned original modules were not selected: ${missingPinned.map(entry=>entry.page.key).join(', ')}`);
  return optimizeCapabilityRichness(selected,catalog,recipe,definition.key);
}

export const ORIGINAL_MODULE_STRENGTHS = SOURCE_STRENGTHS;
export const generatedThemeCompositionInternals={pageCapabilityMetrics,averageCapability,optimizeCapabilityRichness};
