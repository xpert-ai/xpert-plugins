export const definition = {
  "key": "theme14",
  "displayName": "橄榄建筑提案",
  "label": "橄榄建筑提案",
  "name": "橄榄建筑提案",
  "scenario": "建筑设计、空间方案、项目提案",
  "audience": "设计评审方、项目业主",
  "mode": "generated",
  "baselineTheme": "theme09",
  "recipe": {
    "pageCount": 84,
    "sources": [
      "theme09",
      "theme07",
      "theme05",
      "theme01"
    ],
    "familyWeights": {
      "cover": 12,
      "metrics": 11,
      "general": 9,
      "timeline": 10,
      "ranking": 9,
      "media": 11,
      "comparison": 10,
      "statement": 8
    }
  },
  "ownModules": {
    "module": "./signature-pages.jsx",
    "manifest": "./signature-modules.json",
    "minimum": 16
  },
  "tokens": {
    "background": "#2D3423",
    "foreground": "#F3F3ED",
    "accent": "#667553",
    "secondary": "#BFC5B4",
    "motif": "olive-architectural-grid"
  },
  "profile": {
    "heading": "Arial Black, PingFang SC, sans-serif",
    "body": "Inter, PingFang SC, sans-serif",
    "density": "balanced",
    "frame": "architectural-split",
    "chart": "monochrome-mass",
    "media": "black-white-rectilinear",
    "ornament": "short-rule-node",
    "context": "architecture-review",
    "radius": 14,
    "paletteMode": "strict",
    "backgroundCss": "linear-gradient(128deg,rgba(102,117,83,.15),transparent 48%),radial-gradient(circle at 78% 18%,rgba(191,197,180,.07),transparent 34%)",
    "vocabulary": [
      "空间秩序",
      "材料表达",
      "环境响应",
      "运营整合"
    ],
    "visual": {
      "cardFlow": "architectural-grid",
      "titleTransform": "none",
      "titleSpacing": "-.055em",
      "titleWidth": 940,
      "surfaceCss": "border:1px solid rgba(243,243,237,.18);box-shadow:none;",
      "frameCss": "left:44px;right:44px;top:36px;border-top:1px solid rgba(243,243,237,.25);",
      "mark": "●",
      "markCss": "right:52px;bottom:34px;font-size:18px;color:var(--theme-secondary);"
    },
    "qualityVersion": 3
  }
};

export const themeCss = "/* Theme-owned visual layer generated from the registered evidence profile. */\n.theme14-root{--theme-bg:#2D3423;--theme-fg:#F3F3ED;--theme-accent:#667553;--theme-secondary:#BFC5B4;--theme-radius:14px;font-family:Inter, PingFang SC, sans-serif;}\n.theme14-root .theme-frame{isolation:isolate;}\n.theme14-root .theme-heading{font-family:Arial Black, PingFang SC, sans-serif;text-transform:none;letter-spacing:-.055em;max-width:940px;}\n.theme14-root .theme-eyebrow{font-family:Inter, PingFang SC, sans-serif;}\n.theme14-root .theme-surface{border-radius:14px;border:1px solid rgba(243,243,237,.18);box-shadow:none;}\n.theme14-root .theme-frame:before{content:\"\";position:absolute;pointer-events:none;z-index:0;left:44px;right:44px;top:36px;border-top:1px solid rgba(243,243,237,.25);}\n.theme14-root .theme-frame:after{content:\"●\";position:absolute;pointer-events:none;z-index:0;right:52px;bottom:34px;font-size:18px;color:var(--theme-secondary);}\n";
