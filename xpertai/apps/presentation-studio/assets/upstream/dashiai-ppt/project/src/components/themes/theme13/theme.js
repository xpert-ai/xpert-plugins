export const definition = {
  "key": "theme13",
  "displayName": "深蓝光环风",
  "label": "深蓝光环风",
  "name": "深蓝光环风",
  "scenario": "科技汇报、产品发布、技术复盘",
  "audience": "技术团队、产品负责人、企业管理者",
  "mode": "generated",
  "baselineTheme": "theme02",
  "recipe": {
    "pageCount": 86,
    "sources": [
      "theme02",
      "theme03",
      "theme05"
    ]
  },
  "ownModules": {
    "module": "./signature-pages.jsx",
    "manifest": "./signature-modules.json",
    "minimum": 16
  },
  "tokens": {
    "background": "#06183d",
    "foreground": "#f7f9ff",
    "accent": "#6c6fff",
    "secondary": "#3863ff",
    "motif": "deep-halo"
  },
  "profile": {
    "heading": "Inter, PingFang SC, Microsoft YaHei, sans-serif",
    "body": "Inter, PingFang SC, Microsoft YaHei, sans-serif",
    "density": "balanced",
    "frame": "luminous-orbit",
    "chart": "electric-gradient",
    "media": "deep-screen",
    "ornament": "halo-orb",
    "context": "technology-review",
    "radius": 14,
    "paletteMode": "strict",
    "backgroundCss": "radial-gradient(circle at 82% 16%,rgba(108,111,255,.38),transparent 28%),linear-gradient(160deg,#08245a 0%,#030c22 100%)",
    "vocabulary": [
      "技术节点",
      "光环结构",
      "深蓝系统",
      "路径验证"
    ],
    "visual": {
      "cardFlow": "glass",
      "timeline": "horizontal",
      "titleTransform": "none",
      "titleSpacing": "-.04em",
      "titleWidth": 1000,
      "surfaceCss": "border:1px solid color-mix(in srgb,var(--theme-accent) 62%,transparent);background:color-mix(in srgb,var(--theme-accent) 14%,transparent);",
      "frameCss": "width:420px;height:420px;right:-180px;top:-170px;border:80px solid color-mix(in srgb,var(--theme-accent) 35%,transparent);border-radius:50%;",
      "mark": "○",
      "markCss": "right:54px;bottom:32px;color:var(--theme-accent);font-size:34px;"
    },
    "layoutPreset": {
      "coverMode": "centered",
      "cardMode": "soft",
      "sectionRule": "node-arrow"
    },
    "qualityVersion": 3
  }
};

export const themeCss = "/* Theme-owned visual layer generated from the registered evidence profile. */\n.theme13-root{--theme-bg:#06183d;--theme-fg:#f7f9ff;--theme-accent:#6c6fff;--theme-secondary:#3863ff;--theme-radius:14px;font-family:Inter, PingFang SC, Microsoft YaHei, sans-serif;}\n.theme13-root .theme-frame{isolation:isolate;}\n.theme13-root .theme-heading{font-family:Inter, PingFang SC, Microsoft YaHei, sans-serif;text-transform:none;letter-spacing:-.04em;max-width:1000px;}\n.theme13-root .theme-eyebrow{font-family:Inter, PingFang SC, Microsoft YaHei, sans-serif;}\n.theme13-root .theme-surface{border-radius:14px;border:1px solid color-mix(in srgb,var(--theme-accent) 62%,transparent);background:color-mix(in srgb,var(--theme-accent) 14%,transparent);}\n.theme13-root .theme-frame:before{content:\"\";position:absolute;pointer-events:none;z-index:0;width:420px;height:420px;right:-180px;top:-170px;border:80px solid color-mix(in srgb,var(--theme-accent) 35%,transparent);border-radius:50%;}\n.theme13-root .theme-frame:after{content:\"○\";position:absolute;pointer-events:none;z-index:0;right:54px;bottom:32px;color:var(--theme-accent);font-size:34px;}\n";
