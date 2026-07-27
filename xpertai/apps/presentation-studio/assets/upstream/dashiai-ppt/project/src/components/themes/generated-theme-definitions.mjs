// Empty source-of-truth registry for themes generated from external evidence.
// Keep this file free of template-specific styles until a new theme is approved.

export const GENERATED_THEME_BASELINES = {
  theme13:'theme02',
  theme14:'theme12',
  // @new-theme:baseline
};

export const GENERATED_THEME_RECIPES = {
  theme13:{"pageCount":86,"sources":["theme02","theme03","theme05"]},
  theme14:{"pageCount":82,"sources":["theme12","theme09","theme04"]},
  // @new-theme:recipe
};

export const GENERATED_THEME_OWN_MODULES = {
  theme13:{module:'./signature-pages.jsx',manifest:'./signature-modules.json',minimum:16},
  theme14:{module:'./signature-pages.jsx',manifest:'./signature-modules.json',minimum:16},
  // @new-theme:own-modules
};

export const GENERATED_THEME_DEFINITIONS = [
  ['theme13', '深蓝光环风', '科技汇报、产品发布、技术复盘', '技术团队、产品负责人、企业管理者', {"background":"#06183d","foreground":"#f7f9ff","accent":"#6c6fff","secondary":"#3863ff","motif":"deep-halo"}, {"heading":"Inter, PingFang SC, Microsoft YaHei, sans-serif","body":"Inter, PingFang SC, Microsoft YaHei, sans-serif","density":"balanced","frame":"luminous-orbit","chart":"electric-gradient","media":"deep-screen","ornament":"halo-orb","context":"technology-review","radius":14,"paletteMode":"strict","backgroundCss":"radial-gradient(circle at 82% 16%,rgba(108,111,255,.38),transparent 28%),linear-gradient(160deg,#08245a 0%,#030c22 100%)","vocabulary":["技术节点","光环结构","深蓝系统","路径验证"],"visual":{"cardFlow":"glass","timeline":"horizontal","titleTransform":"none","titleSpacing":"-.04em","titleWidth":1000,"surfaceCss":"border:1px solid color-mix(in srgb,var(--theme-accent) 62%,transparent);background:color-mix(in srgb,var(--theme-accent) 14%,transparent);","frameCss":"width:420px;height:420px;right:-180px;top:-170px;border:80px solid color-mix(in srgb,var(--theme-accent) 35%,transparent);border-radius:50%;","mark":"○","markCss":"right:54px;bottom:32px;color:var(--theme-accent);font-size:34px;"},"layoutPreset":{"coverMode":"centered","cardMode":"soft","sectionRule":"node-arrow"},"qualityVersion":3}],
  ['theme14', '紫橙怪趣风', '节日活动、创意课堂、娱乐故事', '活动策划者、教师、创意内容团队', {"background":"#5a247d","foreground":"#fffaf4","accent":"#ff8508","secondary":"#9b54c5","motif":"spooky-festival"}, {"heading":"Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif","body":"Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif","density":"balanced","frame":"spooky-stage","chart":"candy-orange","media":"pumpkin-crop","ornament":"corner-web","context":"festival-story","radius":12,"paletteMode":"adaptive","backgroundCss":"radial-gradient(circle at 88% 14%,rgba(155,84,197,.55),transparent 24%),linear-gradient(145deg,#632487 0%,#42135f 100%)","vocabulary":["南瓜故事","紫橙节奏","怪趣角色","糖果路径"],"visual":{"cardFlow":"stagger","timeline":"steps","titleTransform":"none","titleSpacing":"-.04em","titleWidth":980,"surfaceCss":"border:2px solid color-mix(in srgb,var(--theme-accent) 74%,transparent);background:color-mix(in srgb,var(--theme-secondary) 48%,transparent);","frameCss":"width:360px;height:260px;left:-120px;top:-110px;border:2px solid color-mix(in srgb,var(--theme-fg) 55%,transparent);border-radius:50%;","mark":"✦","markCss":"right:42px;bottom:30px;color:var(--theme-accent);font-size:36px;"},"layoutPreset":{"coverMode":"playful","cardMode":"soft","sectionRule":"candy-node"},"qualityVersion":3}],
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
