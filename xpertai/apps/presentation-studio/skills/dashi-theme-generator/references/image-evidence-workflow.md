# 图片与 PDF 模板证据提取

图片只能证明视觉结果，不能证明字段和运行时。

## 输入要求

- 至少 8 张跨页证据；建议 8-12 张。少于 8 张不足以支撑完整主题，不进入登记流程。
- 尽量覆盖封面、章节、正文、指标、图表、媒体和结尾。
- PDF 先按页渲染 PNG，再制作联系表观察跨页节奏。

## 逐页记录表

每页建立一个 archetype 记录：

```json
{
  "id": "metric-with-editorial-image",
  "referencePages": ["page-04.png"],
  "family": "metrics",
  "grid": {"columns": 12, "margins": [42, 38, 42, 38], "regions": ["title-left", "image-right"]},
  "typeHierarchy": ["display", "metric", "body", "caption"],
  "surfaces": ["flat-canvas", "outlined-pill"],
  "media": {"count": 1, "aspect": "16:9", "crop": "cover"},
  "repeatedPrimitives": ["top-rail", "circle-arrow"],
  "strategy": "modify"
}
```

## 跨页提取顺序

1. 先找固定不变项：页边距、页首、页脚、字体族、主色、图片处理。
2. 再找有限变体：深浅页、左右镜像、标题两行/三行、单图/多图。
3. 再找签名 primitive：箭头、短线、编号、特殊边框、色块、裁切。
4. 最后记录禁用项。禁用项来自“参考集中始终没有出现且与风格冲突”的元素，不凭空添加。

## 证据与推断分离

- `observed`：参考图直接可见。
- `inferred`：为补齐页面库作出的设计推断。
- `runtime-required`：为保证编辑器能力必须增加，但截图无法证明。

每条视觉规则标注来源页。不要把某次模板的颜色、摄影或符号写入通用生成方法。

## 从图片到组件

1. 先从证据中建立至少 8 个不同结构原型，再用原模块目录查询结构相近页面。
2. 若网格、媒体位置和交互一致，选择 `reuse`。
3. 若字段闭包可用但构图差异明显，选择 `modify`，复制整个页面闭包再改 JSX/CSS。
4. 若没有候选，选择 `new`，显式设计 defaults、controls 和 mediaSlots。
5. 图片仅作为审计对照，不作为整页背景资产。
6. 至少 8 个结构原型必须落成 observed `modify/new` 自有模块；通用 `reuse` 页面只用于补齐完整能力库。
7. 将跨页固定项编译为 Style DNA，再为未覆盖 family 推导至少 8 个 inferred 模块。推导模块引用规则和 observed 锚点，不伪造参考页。

## 审计

每个 archetype 至少渲染一页。比较：

- 大区块比例与对齐线。
- 背景/前景/强调色覆盖。
- 标题层级和最大行宽。
- 图片数量、比例、裁切和位置。
- 签名 primitive 是否真实出现。
- 禁用项是否泄漏。
