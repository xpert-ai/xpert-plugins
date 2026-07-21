export const definition = {
  "key": "theme13",
  "displayName": "亮色循环商业",
  "label": "亮色循环商业",
  "name": "亮色循环商业",
  "scenario": "商业计划、品牌战略、增长汇报",
  "audience": "投资决策者、企业管理层",
  "mode": "generated",
  "baselineTheme": "theme11",
  "recipe": {
    "pageCount": 86,
    "sources": [
      "theme11",
      "theme01",
      "theme05",
      "theme09"
    ],
    "generationMode": "fidelity",
    "policyVersion": 2,
    "familyWeights": {
      "cover": 12,
      "table": 11,
      "metrics": 12,
      "comparison": 10,
      "timeline": 9,
      "general": 8,
      "media": 11,
      "statement": 8
    }
  },
  "ownModules": {
    "module": "./signature-pages.jsx",
    "manifest": "./signature-modules.json",
    "minimum": 16
  },
  "tokens": {
    "background": "#F2F1EF",
    "foreground": "#111111",
    "accent": "#B7F23A",
    "secondary": "#856BEA",
    "motif": "bright-circular-editorial"
  },
  "profile": {
    "heading": "Arial Black, PingFang SC, sans-serif",
    "body": "Inter, PingFang SC, sans-serif",
    "density": "balanced",
    "frame": "rounded-editorial",
    "chart": "bright-flat",
    "media": "soft-rounded-crop",
    "ornament": "orbit-arrow-pill",
    "context": "business-growth",
    "radius": 30,
    "paletteMode": "strict",
    "backgroundCss": "radial-gradient(circle at 84% 8%,rgba(133,107,234,.11),transparent 30%),linear-gradient(138deg,rgba(183,242,58,.07),transparent 46%)",
    "vocabulary": [
      "循环增长",
      "协同价值",
      "市场验证",
      "行动路径"
    ],
    "visual": {
      "cardFlow": "asymmetric-editorial",
      "titleTransform": "none",
      "titleSpacing": "-.055em",
      "titleWidth": 1080,
      "surfaceCss": "border:1px solid rgba(17,17,17,.12);box-shadow:none;",
      "frameCss": "inset:28px;border-radius:30px;border:1px solid rgba(17,17,17,.07);",
      "mark": "↗",
      "markCss": "right:54px;bottom:36px;font-size:44px;font-weight:900;color:var(--theme-fg);"
    },
    "generationMode": "fidelity",
    "policyVersion": 2,
    "qualityVersion": 3
  }
};

export const themeCss = "/* Theme-owned visual layer generated from the registered evidence profile. */\n.theme13-root{--theme-bg:#F2F1EF;--theme-fg:#111111;--theme-accent:#B7F23A;--theme-secondary:#856BEA;--theme-radius:30px;font-family:Inter, PingFang SC, sans-serif;}\n.theme13-root .theme-frame{isolation:isolate;}\n.theme13-root .theme-heading{font-family:Arial Black, PingFang SC, sans-serif;text-transform:none;letter-spacing:-.055em;max-width:1080px;}\n.theme13-root .theme-eyebrow{font-family:Inter, PingFang SC, sans-serif;}\n.theme13-root .theme-surface{border-radius:30px;border:1px solid rgba(17,17,17,.12);box-shadow:none;}\n.theme13-root .theme-frame:before{content:\"\";position:absolute;pointer-events:none;z-index:0;inset:28px;border-radius:30px;border:1px solid rgba(17,17,17,.07);}\n.theme13-root .theme-frame:after{content:\"↗\";position:absolute;pointer-events:none;z-index:0;right:54px;bottom:36px;font-size:44px;font-weight:900;color:var(--theme-fg);}\n";
