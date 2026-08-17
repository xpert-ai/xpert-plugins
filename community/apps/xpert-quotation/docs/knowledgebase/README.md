# Xpert Quotation 知识资料目录

更新日期：2026-08-11

本目录保存 `xpert-quotation` 综合单价拆分所需的离线规范化产物、来源状态和人工上传说明。原始 PDF/XLSX 位于上一级 `docs`，均为用户资料，不由脚本覆盖或删除。

完整架构、检索门槛和后续实施顺序见 `docs/综合单价知识库检索与拆分方案.md`。

## 目录结构

```text
docs/
├── 1．江苏省建筑与装饰工程消耗量.pdf
├── 价格信息.pdf
├── 原报价文件.xlsx
├── 综合单价知识库检索与拆分方案.md
└── knowledgebase/
    ├── README.md
    ├── source-inventory.json
    └── normalized/
        ├── jiangsu-building-decoration-2026.quota-items.ndjson
        └── jiangsu-building-decoration-2026.manifest.json
```

## 当前产物

定额规范化结果：

| 指标 | 数量 |
| --- | ---: |
| PDF 页数 | 815 |
| 定额表 | 1,065 |
| 唯一定额子目 | 3,115 |
| 人材机资源行 | 10,393 |
| 结构可摄取 | 2,998 |
| 需要人工修正 | 117 |
| 结构告警 | 177 |

告警明细为：缺失定额单位 105、缺失工作内容 55、缺失资源 12、缺失定额名称 5。`ingestionReady=true` 仅表示结构字段齐全，不表示造价内容已经审核。

代表性质量门槛：

| 定额 | 核对点 |
| --- | --- |
| `13-47` | 界面剂 `12330300` 为 `12.900 kg/10m2` |
| `13-169` | 跨 PDF 529/530 页合并，保留 25 条资源和调整说明 |
| `15-152` | 成品腻子粉 `11450342` 为 `19.845 kg/10m2` |
| `15-161` | 内墙乳胶漆 `11010304` 为 `2.884 kg/10m2` |

## 生成与验证

在 `xpert-quotation` 目录执行：

```bash
node scripts/normalize-quota-pdf.mjs
node --test scripts/quota-normalizer.test.mjs
```

也可以执行包脚本：

```bash
pnpm run knowledge:normalize
pnpm run test:quota-normalizer
```

当前工作区通过 pnpm 执行时可能先被 workspace 的 `protobufjs@7.6.5` ignored-builds 策略阻止。该策略属于工作区级安全配置，不应为本插件测试随意修改；直接 Node 测试不受影响。

生成器会：

1. 通过 PDF 文本坐标识别多列定额表。
2. 合并跨页续表。
3. 生成稳定 `writeKey` 和内容哈希。
4. 保存源文件 SHA-256、PDF 页、印刷页码和原文摘录。
5. 拒绝重复 `writeKey`，并检查代表性定额资源消耗量。
6. 将所有记录初始化为 `reviewStatus=unreviewed`，禁止自动计价。

## NDJSON 记录语义

每一行是一个完整知识记录：

```json
{
  "schemaVersion": "xpert.quotation.quota-chunk/v1",
  "writeKey": "quota:jiangsu:building-decoration:2026:15-161",
  "text": "用于语义检索的完整定额文本",
  "metadata": {
    "documentType": "quota_item",
    "region": "江苏省",
    "edition": "2026",
    "discipline": "建筑与装饰工程",
    "quotaCode": "15-161",
    "reviewStatus": "unreviewed",
    "ingestionReady": true
  },
  "data": {
    "quotaCode": "15-161",
    "quotaName": "内墙面乳胶漆 二遍",
    "quotaUnit": "10m2",
    "workContents": [],
    "resources": [],
    "adjustments": [],
    "source": {}
  }
}
```

`writeKey` 是导入幂等键；同一来源版本再次导入时应 upsert，而不是创建重复记录。`contentHash` 用于识别内容是否变化，`sourceSha256` 用于确认原始 PDF 版本。

## 人工复核策略

状态建议：

| 状态 | 含义 | 可参与检索 | 可自动组价 |
| --- | --- | --- | --- |
| `unreviewed` | 机器提取，未由造价人员核对 | 是，仅作为候选 | 否 |
| `rejected` | 内容错误或不适用 | 否 | 否 |
| `approved` | 名称、单位、人材机、调整和来源均已核对 | 是 | 仍需价格与规则通过审核 |

人工复核至少检查定额名称和单位、各定额列与资源消耗量的对应关系、工作内容、调整系数、适用范围、跨页资源以及源页证据。manifest 中的 117 条 `reviewRequired` 应先修正，其他 2,998 条也不能未经抽样和责任人批准直接变为 `approved`。

## 插件内数据库摄取

插件现已实现完整的定额 PDF 数据库摄取入口，不再要求先把 NDJSON 手工导入知识库：

1. Workbench “知识资料”页通过 `import_quota_pdf` 上传 PDF。
2. 原文件保存到 Workspace Files；数据库只保存可移植文件引用、大小和 SHA-256。
3. Managed Queue 后台任务逐页调用同一个规范化器，持久化任务进度和稳定错误码。
4. PostgreSQL 保存来源版本、定额子目、人材机、原文证据、审核历史、知识库同步状态和同步作业进度。
5. 人工批准/拒绝采用修订号校验；发布时同一来源只有一个 active 版本。
6. 报价第一次检索时固定 `quotaSourceVersionId`，保证历史结果可复现。

生产环境首次启用结构化定额时执行 `docs/migrations/0.7.0-quota-knowledge.sql`；升级到 `0.9.0` 时继续执行 `docs/migrations/0.9.0-resource-pricing.sql`，升级到 `0.10.0` 再执行 `docs/migrations/0.10.0-unit-conversion-and-engineering-routing.sql`，增加单位换算轨迹和定额公式提示。本地开发只有在宿主明确启用 TypeORM `synchronize` 时才会自动建表。

## 同步到 Xpert 知识库

PostgreSQL 是权威事实源；Xpert 知识库只作为可选语义索引。发布版本后可从“知识资料”页同步到当前 Agent 已连接的知识库。同步通过 Managed Queue 后台执行，Workbench 自动轮询进度，并支持取消、失败重试和按 `contentHash` 跳过已同步片段。写入键包含来源版本：

```text
quota:jiangsu:building-decoration:2026:<sourceVersionId>:<quotaCode>
```

片段元数据包含 `quotaItemId`、`sourceVersionId` 和 `contentHash`。报价检索会先查数据库，再对知识库语义结果回库校验当前固定版本和哈希；无法校验的片段不会进入候选。

也可以继续按原生知识库工作台手工导入，但必须满足以下条件：

1. 建立“江苏 2026 建筑装饰定额”知识库。
2. 确认导入方式能保持“一条 NDJSON 记录一个 document/chunk”。不能把 13 MB NDJSON 当普通长文本再次自由切片。
3. 将 `writeKey` 作为外部幂等键，将 `text` 作为检索正文，将 `metadata` 原样保存为过滤元数据。
4. 只导入已决定进入候选池的记录；保留 `reviewStatus`，不要在上传时统一改成 `approved`。
5. 将知识库连接到运行 `xpert-quotation` 的目标 Agent。知识库 ID 不写死在插件配置中。
6. 用定额编号、名称+部位+遍数、工作内容三类查询分别做冒烟测试，并核对返回的文档/chunk ID 和源页。

如果 Xpert 原生导入器无法保留 NDJSON 行边界，应先生成每定额一文件的导入包，或使用平台的结构化批量 upsert 接口；不要接受不可审计的二次自动切片。

插件不会从 iframe 携带宿主凭据，也不允许模型提交任意租户、组织或知识库范围；同步目标必须是当前 Agent 已连接的知识库。

## 建议冒烟查询

```text
定额编号 15-161
内墙面乳胶漆 二遍 10m2
抹灰面 满批成品腻子 二遍
混凝土墙面 刷界面剂
单元式玻璃幕墙 板块制作 铝型材 Low-E玻璃
```

每次查询应返回对应定额编号、工作内容、人材机消耗量和来源页。不能只返回目录页或跨多个定额的混合片段。

## 价格与规则资料

`docs/价格信息.pdf` 已确认是南京市 2026 年 6 月资料，包含建筑、安装、市政、装饰材料，机械租赁、周转材料租赁和建筑工种人工日工资。0.9.0 可从平台召回的 Markdown 表格及扁平工资片段即时解析结构化价格项；但目前还没有生成一价格项一记录的完整离线规范化产物，也未确认该文件已上传到 Xpert。

仍缺少：

1. 江苏省房屋修缮工程计价表（2009）。
2. 江苏省通用安装工程消耗量（2026）。
3. 本项目采用口径的管理费、利润和风险费规则。

缺少上述资料时，检索结果只能用于部分工作组成和人材机直接费分析，不能宣称覆盖所有清单行的完整综合单价。
