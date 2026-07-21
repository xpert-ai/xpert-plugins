// Empty source-of-truth registry for themes generated from external evidence.
// Keep this file free of template-specific styles until a new theme is approved.

export const GENERATED_THEME_BASELINES = {
  theme13:'theme11',
  theme14:'theme09',
  // @new-theme:baseline
};

export const GENERATED_THEME_RECIPES = {
  theme13:{"pageCount":86,"sources":["theme11","theme01","theme05","theme09"],"generationMode":"fidelity","policyVersion":2,"familyWeights":{"cover":12,"table":11,"metrics":12,"comparison":10,"timeline":9,"general":8,"media":11,"statement":8}},
  theme14:{"pageCount":84,"sources":["theme09","theme07","theme05","theme01"],"generationMode":"fidelity","policyVersion":2,"familyWeights":{"cover":12,"metrics":11,"general":9,"timeline":10,"ranking":9,"media":11,"comparison":10,"statement":8}},
  // @new-theme:recipe
};

export const GENERATED_THEME_OWN_MODULES = {
  theme13:{module:'./signature-pages.jsx',manifest:'./signature-modules.json',minimum:16},
  theme14:{module:'./signature-pages.jsx',manifest:'./signature-modules.json',minimum:16},
  // @new-theme:own-modules
};

export const GENERATED_THEME_DEFINITIONS = [
  ['theme13', '亮色循环商业', '商业计划、品牌战略、增长汇报', '投资决策者、企业管理层', {"background":"#F2F1EF","foreground":"#111111","accent":"#B7F23A","secondary":"#856BEA","motif":"bright-circular-editorial"}, {"heading":"Arial Black, PingFang SC, sans-serif","body":"Inter, PingFang SC, sans-serif","density":"balanced","frame":"rounded-editorial","chart":"bright-flat","media":"soft-rounded-crop","ornament":"orbit-arrow-pill","context":"business-growth","radius":30,"paletteMode":"strict","backgroundCss":"radial-gradient(circle at 84% 8%,rgba(133,107,234,.11),transparent 30%),linear-gradient(138deg,rgba(183,242,58,.07),transparent 46%)","vocabulary":["循环增长","协同价值","市场验证","行动路径"],"visual":{"cardFlow":"asymmetric-editorial","titleTransform":"none","titleSpacing":"-.055em","titleWidth":1080,"surfaceCss":"border:1px solid rgba(17,17,17,.12);box-shadow:none;","frameCss":"inset:28px;border-radius:30px;border:1px solid rgba(17,17,17,.07);","mark":"↗","markCss":"right:54px;bottom:36px;font-size:44px;font-weight:900;color:var(--theme-fg);"},"generationMode":"fidelity","policyVersion":2,"qualityVersion":3}],
  ['theme14', '橄榄建筑提案', '建筑设计、空间方案、项目提案', '设计评审方、项目业主', {"background":"#2D3423","foreground":"#F3F3ED","accent":"#667553","secondary":"#BFC5B4","motif":"olive-architectural-grid"}, {"heading":"Arial Black, PingFang SC, sans-serif","body":"Inter, PingFang SC, sans-serif","density":"balanced","frame":"architectural-split","chart":"monochrome-mass","media":"black-white-rectilinear","ornament":"short-rule-node","context":"architecture-review","radius":14,"paletteMode":"strict","backgroundCss":"linear-gradient(128deg,rgba(102,117,83,.15),transparent 48%),radial-gradient(circle at 78% 18%,rgba(191,197,180,.07),transparent 34%)","vocabulary":["空间秩序","材料表达","环境响应","运营整合"],"visual":{"cardFlow":"architectural-grid","titleTransform":"none","titleSpacing":"-.055em","titleWidth":940,"surfaceCss":"border:1px solid rgba(243,243,237,.18);box-shadow:none;","frameCss":"left:44px;right:44px;top:36px;border-top:1px solid rgba(243,243,237,.25);","mark":"●","markCss":"right:52px;bottom:34px;font-size:18px;color:var(--theme-secondary);"},"generationMode":"fidelity","policyVersion":2,"qualityVersion":3}],
  // @new-theme:definition
].map(([key, displayName, scenario, audience, tokens, profile]) => ({
  key,
  displayName,
  label: displayName,
  name: displayName,
  scenario,
  audience,
  mode: 'generated',
  baselineTheme: GENERATED_THEME_BASELINES[key],
  recipe: GENERATED_THEME_RECIPES[key],
  ownModules: GENERATED_THEME_OWN_MODULES[key],
  tokens,
  profile,
}));

export const GENERATED_THEME_KEYS = GENERATED_THEME_DEFINITIONS.map(theme => theme.key);
