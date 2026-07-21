# External theme spec contract

`themes:external-plan` consumes an evidence spec, not the inventory or adapter plan. Build it only after the external pages have been inspected. The canonical complete examples are:

- `project/theme-evidence/theme13-commercial-plan-spec.json`
- `project/theme-evidence/theme14-architecture-plan-spec.json`
- `project/theme-evidence/reuse-first-example-spec.json`（图片/PDF 快速生成）

## Required shape

```json
{
  "key": "theme15",
  "displayName": "Theme name",
  "generationMode": "reuse-first",
  "references": ["page-01.png", "page-02.png", "...at least 8 real references"],
  "target": {
    "pageCount": 84,
    "observedModuleCount": 2,
    "derivedModuleCount": 0,
    "scenario": ["scenario 1", "scenario 2"],
    "audience": ["audience 1", "audience 2"]
  },
  "sourceThemes": ["theme07", "theme09"],
  "visualEvidence": {
    "palette": ["four or more evidence statements with colors and semantic roles"],
    "typography": ["two or more evidence statements"],
    "composition": ["two or more evidence statements"],
    "surfaces": ["two or more evidence statements"],
    "imageTreatment": ["two or more evidence statements"],
    "motifs": ["two or more evidence statements"],
    "signatureRules": ["two or more evidence statements"],
    "forbidden": ["two or more evidence statements"]
  },
  "visualImplementation": {
    "profileStrategy": "new",
    "profileId": "stable-profile-id",
    "paletteMode": "strict",
    "tokens": {
      "background": "#FFFFFF",
      "foreground": "#111111",
      "accent": "#55BFB4",
      "secondary": "#7355CC"
    },
    "requiredPrimitives": ["primitive-1", "primitive-2", "primitive-3", "primitive-4"]
  },
  "archetypes": [
    {
      "id": "distinct-structure-id",
      "referencePages": ["page-01.png"],
      "family": "cover",
      "strategy": "new",
      "needsMedia": true,
      "weight": 10,
      "notes": ["observed structure", "observed hierarchy", "observed surface or motif"]
    }
  ]
}
```

All evidence, notes, scenarios, audiences, references, and primitive ids are non-empty strings. Do not write objects into `visualEvidence`; each object must first be compiled into an evidence sentence so Style DNA remains meaningful.

## Archetype gate

`generationMode` 是机器可读的必选设计取舍，不从文案或文件名猜测：

| 模式 | 证据引用 | archetypes | notes/原型 | modify/new | inferred | 外部家族要求 |
|---|---:|---:|---:|---:|---:|---|
| `reuse-first` | ≥4 | ≥4 | ≥1 | 默认 2、最多 4 | 0-4，默认 0 | 包含 cover、general，共 ≥3 家族 |
| `fidelity` | ≥8 | ≥8 | ≥3 | ≥8 | 8-16 | 包含 cover、general、metrics、media，另含 ≥2 个复杂家族，共 ≥6 家族 |

`reuse-first` 适合只有截图/PDF、重点是快速获得可用主题的任务。`target.observedModuleCount` 可在 2-4 之间显式设置，省略时为 2。结构匹配的 archetype 使用 `reuse`；即使上游模型提出了更多 `modify/new`，规划器也只保留预算内最有辨识度且家族不同的签名模块，其余自动转换为 `recipe.pinnedModules`。固定复用保留原组件的字段、控件、图表、媒体和运行时闭包。

`fidelity` 适合用户明确要求更深结构还原的任务，保留原有高密度门槛。

两种模式都要求 archetype id 唯一，`referencePages` 指向已检查的证据，并禁止复制 archetype 凑数。模式必须在第一次规划前确定；不能在失败后私改 planner 常量绕过所选模式的契约。

If `themes:external-plan` rejects the spec, edit the spec according to every reported contract issue and rerun it once. Do not rerun an unchanged command or report a planner contract failure as a renderer/runtime failure.
