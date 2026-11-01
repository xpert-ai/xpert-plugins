# Superstore 企业 BI — v1

一个 ChatKit 项目，三个看板：`overview.html`（零售经营总览）、`profitability.html`（商品盈利）、`customers.html`（客户与退货）。这是 Tableau 的虚构教学数据，必须保留页面演示标识。页面参考经典企业经营分析的信息组织，自行实现；不是第三方产品截图。

## 数据准备（管理员一次完成）

1. 阅读 `provenance.json` 和 `THIRD_PARTY_LICENSE.txt`。`orders.csv` 是固定官方工作簿的确定性转换结果，10,194 行；不要把整个文件送入模型上下文。
2. 在 Data Xpert 中为有权限的工作空间绑定一个 PostgreSQL 演示数据源，通过“导入”上传 `orders.csv`。`import.json` 是字段定义：金额为 NUMERIC(20,6)，邮编为文本，`returned_order_id` 允许 NULL。使用一个尚不存在的表名；不要选择删除/覆盖已有表。API 自动化也必须先检查表是否存在，不能重复追加。
3. 创建新的 SQL 语义模型，以 `semantic-model.json` 为结构模板，按实际元数据调整数据库/schema/表名；保留技术 Cube 名 `SuperstoreOrders` 和字段名。核对所有度量与维度后执行草稿验证，发布到有权限的业务域。
4. 将发布后的本体资源授权给当前 Live Dashboard Assistant，配置 Data Xpert integration 和当前查看者的只读查询权限。数据权限不会由安装本样例自动授予。
5. 通过 Data Xpert 真实查询核对 `expected.json`。全量订单 5,111、客户 804、退货订单 296；金额核对到 6 位小数。未经验证不能宣布“数据准备完成”。

此配方使用 `data-xpert.ontology`，不是 `file.table`。缺少已发布模型时报告这一前置步骤；不得用三个入门配方、小量自造数据或浏览器内嵌数据替代。数据准备不需要增加新的 Project View 或后台定时任务。

## 助理制作步骤

先读 [主题选择说明](../../themes/README.md)，再读目标页的独立主题指南。三个可选风格都使用键盘可用的双层标签选择器；CSS、选择器和图表组件随技能安装，通过版本和内容哈希固定的文档库加载。

| 页面 | 风格及指南 | libraries |
| --- | --- | --- |
| `overview.html` | [Trend Workspace](../../themes/trend-workspace/README.md)：浅蓝 KPI 侧栏、上下趋势 | `["echarts","trend-workspace"]` |
| `profitability.html` | [Profit Atlas](../../themes/profit-atlas/README.md)：深色横向指标、大散点图、带正负号的利润排名 | `["echarts","profit-atlas"]` |
| `customers.html` | [Customer Brief](../../themes/customer-brief/README.md)：暖纸色、衬线标题、分组退货指标 | `["echarts","customer-brief"]` |

用户要求美化已有看板时，逐个 `dashboard_open` / `dashboard_update`，保留 Artifact、Binding、控件和已有 HTML ID，显式传入目标页对应的 libraries。先读当前编辑副本，用有界精确编辑替换业务布局，不能新建副本。没有要求重设计时保留已有风格。用于其他数据时须重新匹配字段和口径，不能只替换标题而保留 Superstore 字段。

1. 先阅读主技能和 HTML runtime/lifecycle。确认当前 ChatKit Project。用户请求整个案例时制作三个草稿；只请求其中一个时仅制作该页。
2. 使用 `dashboard_list_sources` 和 Data Xpert analytics definition 的 connections/inspect/register/discover 流程，找到当前 Assistant 已授权的 **SuperstoreOrders**。记录实际 definitionId/versionId、resourceId、entityRef；不能沿用别的 Assistant/项目的 ID。
3. 用 `read_skill_file` 阅读目标页的 `*.queries.json`（相对技能目录定位）。每个 binding 是查询计划，尚未包含 source；替换 payload 中发现得到的 resourceId/entityRef，并添加本次 source。字段类型、可空性、action schema 以实际发现结果为准；稳定保留 binding.id、output.datasetId、output.fields[].id 和控件 ID，HTML 使用这些名字。
4. 每个查询包含同样的 year/region/category 参数。空字符串表示全部，通过 contains 匹配；allowedValues 严格限定工作簿中真实存在的枚举。总计 Binding 的 dimensions 必须为空，让后端执行 COUNT DISTINCT；不能把月度、子品类或分群的订单/客户数相加冒充全量。
5. 使用 `dashboard_preview_binding` 预览每个完整 Binding。先读小文件 `checks.json`，对总计 Binding 用 `dashboard_test_filter` 验证全量、West、East、2024、Furniture 和组合筛选；`controls` 原样传全部三个值，`expectations` 选择实际存在的字段，`fieldId` 设为该字段名，`oneOf` 使用对应 case 的 summary 中原样字符串值。Data Xpert 的 int64/decimal 查询结果是字符串，oneOf 必须同类型。不要把全量计数当成区域计数；不要为验证筛选反复修改 Binding 默认值。分组查询与 `expected.json` 对照，并完成 preview 返回的 validation.suggestedCall。
6. 调用 `dashboard_libraries`，按上表只选择 ECharts 和该页一个主题。使用 `read_skill_file` 读取目标 HTML **完整内容**（不是只读前一段）；若改用 sandbox_read_file 必须读取全部行。逐页读取、写入并保存，完成一页后再处理下一页，不在一次模型输出中重写三页。原样保留 HTML/CSS/JS，不压缩或简化。写入当前项目的新相对路径，例如 `superstore-v1/overview.html`。若路径已有不同内容，改用新的文件名，不覆盖别的 Artifact。使用 SandboxFile 工具；不需要重写模板代码或复制 10,194 行数据到 Sandbox。
7. 对三个页面分别调用 `dashboard_create_html`：标题为 `Superstore · 零售经营总览`、`Superstore · 商品盈利分析`、`Superstore · 客户与退货分析`，传入各自全部 previewIds、原样 controls 和 libraries。预检失败则按具体错误修复后重试，不省略 Binding 或控件。**三个页面的 Binding 集合不同，不能只把标题换掉。**
8. 收到成功的草稿回执后报告三个 Artifact 和修订，用户通过回执卡片/级联选择器打开。不要重新打开未改变的看板来确认保存；不要自动发布。

## 总计筛选基准（当前固定数据版本）

执行 `dashboard_test_filter` 时用下表当前筛选对应的值，不猜测常见 Superstore 版本的计数。int64 和 decimal 都使用字符串。全量参数都是空字符串。先验证 Orders 与 Customers；金额同时与真实返回值核对。

| year | region | category | Orders | Customers | Sales | Profit |
| --- | --- | --- | --- | --- | --- | --- |
| `""` | `""` | `""` | `"5111"` | `"804"` | `"2326534.354300"` | `"292296.814600"` |
| `""` | `"West"` | `""` | `"1635"` | `"686"` | `"739813.608500"` | `"110798.817000"` |
| `""` | `"East"` | `""` | `"1475"` | `"685"` | `"691828.168000"` | `"94883.260300"` |
| `"2024"` | `""` | `""` | `"1723"` | `"704"` | `"745567.531200"` | `"95926.347600"` |
| `""` | `""` | `"Furniture"` | `"1819"` | `"714"` | `"754747.761300"` | `"19729.995600"` |
| `"2024"` | `"West"` | `"Furniture"` | `"202"` | `"184"` | `"74155.119500"` | `"2892.830000"` |

West 的 Orders 必须为 `"1635"`，不是其他版本的示例计数。若校验失败，读取 `checks.json` 与查询结果查明差异，不要通过更改默认筛选反复重试同一错误期望。

## 指标与交互

- Sales/Profit/Quantity 为订单行求和；Orders/Customers 为当前筛选的不同订单/客户数。
- 利润率 = 总利润 / 总销售额；客单价 = 总销售额 / 订单数。分母为零不显示伪造比率。
- Returns 原表 800 行，先按 Order ID 去重成 296 个订单再关联。ReturnedOrders 忽略 NULL，ReturnedSales 是退货订单关联的销售额，**不是退款或损失**。
- 年份、区域、品类改变时查询当前页的所有 Binding。各看板控件状态独立；同一页所有面板同范围。
- 查询错误、截断、无结果时清除之前的指标，保留明确状态；不要继续展示上一筛选的数值。
- 原值以 decimal 字符串传输，金额展示到两位；绘图及比率计算在验证安全数值范围后转换为 Number。

## 重建与验收

开发者安装 `xlrd==2.0.2` 后运行 `python build_data.py --workbook <下载文件>`；哈希不一致会停止。再运行 `python build_pages.py`，将本目录的业务布局与运行时组合成三个 HTML；主题组件由每页对应的受控文档库注入。Agent 直接使用已安装的组件与配方，不需要运行构建器。原始数据版本、CSV 哈希和许可见 `provenance.json`。

验收：全量 → West → East → 全量，2024、Furniture、组合筛选，刷新、空结果、权限失败、截断、窄屏和深色主题。比较所有图表和总计，确认项目双向同步与 Artifact 归属。浏览器模拟检查只证明页面生命周期；真实 Data Xpert 查询与安装后界面验收另行记录。
