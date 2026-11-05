# 运行时绑定格式

绑定是本技能查询脚本的本地输入，不是平台现有 API 的新增 schema。它由当前授权模型的元数据、成员发现和业务角色确认生成；不得从公司名称、中文显示标题或样本金额猜测角色。公共技能只保留合成示例，本次真实映射置于任务工作目录，不提交至公共仓库。

`contract` 必须为 `bpc-cost-expense-v1`，表示已经按语义合同核对；该字段自身不是验证证明。读取和核对真实模型后填写以下内容：

| 字段 | 内容 |
| --- | --- |
| source_hint | 当前 resourceId、target.entityTypeCode=semantic_cube、target.entityRef；精确来自已授权来源 |
| measure | SignData 对应的 native 度量唯一名 |
| dimensions | CATEGORY、PLANYEAR、TIME、ENTITY、ACCOUNT、RPTCURRENCY 到 native dimension ID 的精确映射 |
| account_axis | 当前生产成本分类层级及 level 的精确唯一名 |
| members.actual_category / actual_plan_year | A00、DUMMY_PLANYEAR 对应的当前唯一名 |
| members.budget_versions | 明确属于预算/预测角色的业务编码到当前唯一名；不依据前缀分类 |
| members.plan_years / months | 当前可用计划年度键（YYYY）/单月键（YYYY-MM）到唯一名 |
| members.entities / currencies | 明确的组织/报告币种键到唯一名 |
| members.cost_accounts | 合同内六个成本编码到当前唯一名；不可遗漏或把父子成员混入 |
| fixed_slicers | 已核实必要的其他维度约束，每项为 field 与单值 value；没有额外约束时为 [] |
| example_only | 合成示例为 true；实际映射为 false |

唯一名保留全部空格和转义，不根据一个成员推导其他成员。版本、年度、期间和组织列表可以只包含本次所需候选，但要注明实际覆盖；这不是模型全部可用数据的永久目录。

脚本输出 `budget_params`、`actual_params`、`source_hint` 和 `scope`。原生查询入口为 `data-xpert.ontology` Provider 的 `mdx.query_cube_slice` Action；先核对当前工具合同。只有两个 params 对象放入对应原生查询载荷；source_hint 不是完整 canonical binding，不包含 source definition/version、output 字段映射、previewId 或授权。构造实际绑定时使用当前发现或 `dashboard_open` 返回的真实合同。

输出同时给出当前预期的科目唯一名集合，供结果覆盖校验；并明确 `live_validation_performed=false`。`example_only=true` 的输出不得对真实来源执行，不能当作已查询或已保存。

## 两个环境复用

环境一与环境二都满足相同逻辑模型时，使用同一个子技能。各自生成自己的 binding 文件，命令只替换 `--binding` 及业务选择。资源、Cube、技术维度与成员名都从各自文件进入输出，脚本没有内置任何环境 ID 或连接。

参考 [合成绑定](runtime-binding.example.json) 了解结构。可离线生成示例 JSON：

```sh
python3 scripts/build_queries.py \
  --binding references/runtime-binding.example.json \
  --budget-version BUD01 --plan-year 2030 --month 2030-01 --currency CNY
```

这里的 Example、DEMO_PLANNING、日期和成员均为说明格式的合成数据，无真实来源身份和金额。真正查询前应完成模型及其他维度范围检查。
