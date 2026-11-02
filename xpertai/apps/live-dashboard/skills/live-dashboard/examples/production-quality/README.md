# 生产质量 / production-quality — v1

这是可复制的制作配方，演示数据是人为构造的，不代表任何客户或业务。`preview.png` 是这份演示数据的页面预览。

## 数据与口径

- 粒度：`date, line`，同一粒度不重复。产量、良品数和不良品数的单位为件，均为非负整数。
- 筛选：`line`，默认 `null` 表示全部；不要用字符串 `"null"`。
- 良品率 = sum(good) / sum(produced)，不能平均每行百分比；无产量时显示“—”。defects 为不良品数量，不是缺陷事件数。
- `definition.json` 给出列类型和业务说明；`query.json` 给出查询字段、参数和控件；`expected.json` 给出验收结果。

## 用演示数据制作

1. 读取主技能及 `../README.md`。确认当前 ChatKit 项目已选定，用户明确要求演示数据。
2. 读取 `demo.csv`，以 SandboxFile 工具写入当前项目的 `live-dashboard-examples/production-quality/demo-v1.csv`。如果已存在，先读内容；不同则使用新文件名，不覆盖。`demo.json` 是同一数据的替代输入，使用时 reader 应为 `{"format":"json","rowsPath":[]}`，列 path 保持相同。
3. 按共享制作流程注册实际文件并取得当前 source / discovery / bindingPayload；不要把文件路径放进 Binding payload。
4. 基于 `query.json`，使用发现结果的 datasetId、revision 和 contractHash 构造查询。预览全部、至少两个筛选值，逐项比对 `expected.json`。输出字段 id 必须与本样例列 key 一致；logicalType/nullable/unit 必须与发现结果一致。
5. 读取 `dashboard.html`，仅使用本次唯一的完整 Dataset Binding。保留注释中的数据与生命周期约束。调用 dashboard_libraries，写入当前项目文件，再使用本次 previewIds、query.json 的 controls 和 libraries:["echarts"] 调用 dashboard_create_html。
6. 检查成功保存回执，报告看板及草稿修订，结束制作；不要为了确认保存而再调用 dashboard_open/update。用户通过回执卡片打开看板核对筛选、刷新与项目归属。保存失败不得宣布完成，发布仍需人工确认。

## 换成真实数据

先使用已授权来源发现与真实预览，将业务字段映射到本配方列（或同步改写页面字段和控件）。确认粒度、单位、日期和指标口径。缺少必要字段时说明缺口，不插入演示行、不补零、不复制旧 source/preview/Artifact ID。移除演示标识仅限绑定和所有可见数值均来自已验证真实来源之后。

配方更新不迁移或覆盖已创建的看板。编辑现有看板必须先 dashboard_open，保持 Artifact、组件 ID 和预期修订。
