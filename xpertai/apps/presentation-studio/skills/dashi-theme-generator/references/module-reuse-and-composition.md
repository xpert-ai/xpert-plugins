# 原 12 主题模块复用与组合

机器目录：`baseline-module-catalog.json`。它由当前 Dashi 工程的标准化契约自动生成，包含 1020 个页面的结构家族、字段数量、数组深度、控件类型、媒体容量和锁定状态。

## 查询

```bash
node ../scripts/query-baseline-modules.mjs --family comparison --min-fields 35 --control range --limit 20
node ../scripts/query-baseline-modules.mjs --family media --needs-media --min-media 4 --theme theme09 --limit 20
node ../scripts/query-baseline-modules.mjs --family relationship --min-arrays 2 --limit 20
```

## 主题能力定位

| 主题 | 主要强项 | 常见用途 |
|---|---|---|
| theme01 | 均衡封面、指标、比较、时间线、媒体 | 通用主题主来源 |
| theme02 | 科技产品、参数、发布节奏、科技媒体 | 技术发布与产品 |
| theme03 | 工程、架构、代码、系统关系 | 工程技术补充 |
| theme04 | 消费产品、轻量关系、媒体、卡片 | 年轻产品主题 |
| theme05 | 图表、分布、排名、矩阵、表格 | 数据能力补充 |
| theme06 | 网络、关系、战略、高密度分析 | 复杂关系补充 |
| theme07 | 研究、方法、证据、表格、正式叙事 | 研究能力补充 |
| theme08 | 高端媒体、产品陈列、戏剧化指标 | 品牌与媒体补充 |
| theme09 | 杂志、人物、故事、时间线、大量媒体 | 编辑叙事主来源 |
| theme10 | 金融指标、风险收益、组合、表格 | 金融能力补充 |
| theme11 | 增长、渠道、转化、漏斗、行动路径 | 增长能力补充 |
| theme12 | 活动、娱乐、人物、多媒体和情绪页面 | 活动媒体补充 |

## 组合原则

- 先按内容结构选择来源，后按视觉 profile 统一风格。
- 不从不同页面拆出 controls、chart 和 media 拼成新闭包。
- 图表能力不足时补 theme05/theme10；关系不足补 theme06/theme03；研究不足补 theme07；媒体不足补 theme09/theme12/theme08。
- 每个选中模块必须能解释它在目标场景中的用途。
- 签名页是主题自己的作者模块；常规能力页使用原模块。
- `reuse-first` 中匹配外部 archetype 的原页面写入 `recipe.pinnedModules`。组合器把这些页面视为不可丢失的配额，与主题自有模块一起优先选择；它们不是复制出来的简化 JSX。
- `reuse-first` 默认只保留 2 个、最多 4 个 observed 自有模块。上游模型提出更多 `modify/new` 时，规划器依据权重、签名家族和来源能力把超额项转换为 pinned reuse，避免简单自有页稀释完整主题的字段丰富度。
- 每个外部 `modify/new` archetype 生成一个 observed 主题自有模块；规划器再按 Style DNA 和 family 缺口生成 inferred 自有模块。只有 `reuse` archetype 可直接指向原模块。
- 组合顺序是主题自有模块库在前、原主题能力库在后；同 family 内自有模块优先，但仍由原模块补齐约 84 页的完整能力覆盖。
- 组合器读取 recipe 中的字段与数组丰富度目标；若初次选择不足，会在同 family 内自动用更丰富的未选原页面替换普通候选，且不会替换 owned 或 pinned 页面。

## familyWeights 示例

```json
{
  "metrics": 11,
  "comparison": 8,
  "timeline": 7,
  "relationship": 6,
  "distribution": 8,
  "ranking": 8,
  "proportion": 5,
  "table": 7,
  "media": 14,
  "statement": 7,
  "general": 19
}
```

权重表达场景，不表达视觉。媒体型模板提高 media；研究型提高 table/comparison；战略型提高 relationship/timeline；数据型提高 distribution/ranking/proportion。

## 选择记录

每个映射记录：

```json
{
  "archetype": "editorial-metric",
  "strategy": "modify",
  "sourceTheme": "theme09",
  "sourcePageKey": "theme09_page042",
  "preserved": ["defaultProps", "controls", "mediaSlots"],
  "changed": ["grid", "title placement", "surface CSS"],
  "evidencePages": ["reference-04.png"]
}
```

当 `strategy` 为 `reuse` 时，规划器同时生成可执行的固定映射：

```json
{
  "archetypeId": "medical-sales-dashboard",
  "family": "metrics",
  "sourceTheme": "theme05",
  "sourcePageKey": "theme05_page042",
  "reuseJustification": ["指标网格和媒体容量匹配"]
}
```

该条目进入新主题 recipe 的 `pinnedModules`。运行时仍使用完整 `Component + defaultProps + controls + mediaSlots` 页面闭包，只由目标主题 profile 统一颜色、字体和表面语法。
