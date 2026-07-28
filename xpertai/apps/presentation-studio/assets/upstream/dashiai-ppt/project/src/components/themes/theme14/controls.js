export const themeControls = [
  {
    "key": "density",
    "label": "信息密度",
    "type": "select",
    "default": "balanced",
    "options": [
      {
        "value": "compact",
        "label": "紧凑"
      },
      {
        "value": "balanced",
        "label": "平衡"
      },
      {
        "value": "spacious",
        "label": "舒展"
      }
    ],
    "effect": {
      "scope": "section",
      "targets": [
        "layout",
        "surface"
      ],
      "minChangedRatio": 0.01,
      "minRegions": 2
    }
  },
  {
    "key": "showOrnament",
    "label": "主题装饰",
    "type": "toggle",
    "default": true,
    "effect": {
      "scope": "component",
      "targets": [
        "ornament"
      ],
      "minChangedRatio": 0.005,
      "minRegions": 1
    }
  }
];
