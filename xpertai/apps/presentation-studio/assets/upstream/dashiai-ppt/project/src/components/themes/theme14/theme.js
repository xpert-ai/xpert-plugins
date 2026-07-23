export const definition = {
  "key": "theme14",
  "displayName": "紫橙怪趣风",
  "label": "紫橙怪趣风",
  "name": "紫橙怪趣风",
  "scenario": "节日活动、创意课堂、娱乐故事",
  "audience": "活动策划者、教师、创意内容团队",
  "mode": "generated",
  "baselineTheme": "theme12",
  "recipe": {
    "pageCount": 82,
    "sources": [
      "theme12",
      "theme09",
      "theme04"
    ]
  },
  "ownModules": {
    "module": "./signature-pages.jsx",
    "manifest": "./signature-modules.json",
    "minimum": 16
  },
  "tokens": {
    "background": "#5a247d",
    "foreground": "#fffaf4",
    "accent": "#ff8508",
    "secondary": "#9b54c5",
    "motif": "spooky-festival"
  },
  "profile": {
    "heading": "Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif",
    "body": "Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif",
    "density": "balanced",
    "frame": "spooky-stage",
    "chart": "candy-orange",
    "media": "pumpkin-crop",
    "ornament": "corner-web",
    "context": "festival-story",
    "radius": 12,
    "paletteMode": "adaptive",
    "backgroundCss": "radial-gradient(circle at 88% 14%,rgba(155,84,197,.55),transparent 24%),linear-gradient(145deg,#632487 0%,#42135f 100%)",
    "vocabulary": [
      "南瓜故事",
      "紫橙节奏",
      "怪趣角色",
      "糖果路径"
    ],
    "visual": {
      "cardFlow": "stagger",
      "timeline": "steps",
      "titleTransform": "none",
      "titleSpacing": "-.04em",
      "titleWidth": 980,
      "surfaceCss": "border:2px solid color-mix(in srgb,var(--theme-accent) 74%,transparent);background:color-mix(in srgb,var(--theme-secondary) 48%,transparent);",
      "frameCss": "width:360px;height:260px;left:-120px;top:-110px;border:2px solid color-mix(in srgb,var(--theme-fg) 55%,transparent);border-radius:50%;",
      "mark": "✦",
      "markCss": "right:42px;bottom:30px;color:var(--theme-accent);font-size:36px;"
    },
    "layoutPreset": {
      "coverMode": "playful",
      "cardMode": "soft",
      "sectionRule": "candy-node"
    },
    "qualityVersion": 3
  }
};

export const themeCss = "/* Theme-owned visual layer generated from the registered evidence profile. */\n.theme14-root{--theme-bg:#5a247d;--theme-fg:#fffaf4;--theme-accent:#ff8508;--theme-secondary:#9b54c5;--theme-radius:12px;font-family:Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif;}\n.theme14-root .theme-frame{isolation:isolate;}\n.theme14-root .theme-heading{font-family:Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif;text-transform:none;letter-spacing:-.04em;max-width:980px;}\n.theme14-root .theme-eyebrow{font-family:Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif;}\n.theme14-root .theme-surface{border-radius:12px;border:2px solid color-mix(in srgb,var(--theme-accent) 74%,transparent);background:color-mix(in srgb,var(--theme-secondary) 48%,transparent);}\n.theme14-root .theme-frame:before{content:\"\";position:absolute;pointer-events:none;z-index:0;width:360px;height:260px;left:-120px;top:-110px;border:2px solid color-mix(in srgb,var(--theme-fg) 55%,transparent);border-radius:50%;}\n.theme14-root .theme-frame:after{content:\"✦\";position:absolute;pointer-events:none;z-index:0;right:42px;bottom:30px;color:var(--theme-accent);font-size:36px;}\n";
