# 验证结果

> 全部结果来自一次连续的真实运行：真实平台（Node 启动）、真实模型调用、真实浏览器。
> 未修改数据库中的任何插件业务行来"制造"结果——文末 [§9](#9-失败重试是真实发生的) 专门说明这一点。

## 1. 插件被宿主成功加载

安装响应：

```json
{"success":true,"name":"@xpert-ai/plugin-contract-review",
 "currentVersion":"0.1.0","runtimeConvergence":{"generation":4}}
```

API 日志（`/api/plugin` 请求内）：

```
register contract review plugin
ContractReviewPlugin dependencies initialized
```

两张表已建好，插件实例配置校验通过：

```
plugin_contract_review_case
plugin_contract_review_clause
configurationStatus = valid
```

## 2. 助手从模板创建成功

| 项 | 值 |
| --- | --- |
| xpert id | `f8cf7550-591f-42c2-b400-897636188260` |
| slug | `contract-review-assistant` |
| workspace | `254b7612-2be7-4454-a0ce-461029130018` |
| copilot 模型 | `MiniMax-M3`（`modelType: llm`） |
| publish | `true` |

## 3. 工作台视图确实挂上了

`GET /api/view-hosts/agent/<xpertId>/slots/agent.workbench.fixed/views` 返回：

```
view: contract-review__contract_review_workbench | defaultPageSize = 25
```

两个槽位（`agent.workbench.fixed` 与 `agent.workbench.main`）都能发现该视图。

> 注意主机用的是 **xpert id**，不是 agent 实体 id——用后者会 404
> `Not found xpert ... in current tenant`。

## 4. 真实模型调用：Agent 抽出了 4 条逐字条款

对真实合同（[`assets/sample-contract.txt`](./assets/sample-contract.txt)，数控加工中心采购合同 CG-2026-0431）
发起一次审查后，Agent 读取合同全文并登记条款，最终案例状态转为 `extracted`：

| # | 条款类型 | AI 风险等级 | 原文摘录是否逐字一致 |
| --- | --- | --- | --- |
| 0 | payment（付款条件） | `medium` | ✅ |
| 1 | delivery（交付） | `low` | ✅ |
| 2 | warranty（质保） | `medium` | ✅ |
| 3 | liability（违约责任） | `high` | ✅ |

模型还给出了一个**跨条款**的判断（原样摘录自 UI）：

> 需特别注意：质保金锁定 24 个月，但第四条的整机质保期只有 12 个月，
> 存在「质保期外、质保金未退」的空窗期。

对应原文 2.3 条（质保金 24 个月）与 4.2 条（质保期 12 个月）——这处不一致是合同里客观存在的，
不是提示词写死的。

## 5. 人工确认后落库：AI 列与人工列分开

在真实浏览器里对案例 `956592da-36bb-4ac0-8022-46238625fa33` 逐条处置
（确认 2 条、修改 1 条、驳回 1 条），保存后回读数据库：

| # | 条款类型 | `aiRiskLevel`（AI 原判） | `humanDecision`（人工终判） | `humanConclusion` |
| --- | --- | --- | --- | --- |
| 0 | payment | `medium` | `confirmed` | — |
| 1 | delivery | `low` | `edited` | 「交付起算点绑定预付款到账，我方须先付款才起算 90 天交期；接受，但要求乙方在合…」 |
| 2 | warranty | `medium` | `rejected` | — |
| 3 | liability | `high` | `confirmed` | — |

案例本身：`status = confirmed`，`confirmedAt = 2026-09-17T08:52:11.307Z`。

**关键点**：人工「修改」后，`aiRiskLevel` / `aiConclusion` 仍然保留原值，人工结论写进
`humanConclusion`——两者是**不同的列**，人工不覆盖 AI 原判。

## 6. 结果保存与恢复

重新载入页面（并在此后重启过整个 API 进程）后，工作台仍显示：

```
已完成 · 已确认 4/4 · 落库：2026-09-17 16:52
共 4 条 · 已确认 2 · 已修改 1 · 已驳回 1 · 待处理 0
```

见 [`assets/04-saved-and-restored.png`](./assets/04-saved-and-restored.png)。

## 7. 未处置条款被拒绝落库

4 条全部处于 `待处理` 时点「保存审查结论」，前端如实拒绝：

```
还有 4 条条款未处置，确认后才会落库
```

见 [`assets/03-partial-save-guard.png`](./assets/03-partial-save-guard.png)。
不是静默丢弃，也不是保存一份不完整的结论。

服务端同样有一道闸（`saveReview` 里 `stats.pending > 0 && !input.allowPartial` 时返回
`saved: false`），前端只是把服务端的如实回复呈现出来。

## 8. 插件配置确实生效（本次修复）

验证过程中发现并修复了一个缺陷：`extractionTimeoutSeconds` 与 `defaultPageSize`
在插件配置 schema、配置表单、环境变量默认值里都声明了，**但运行时从未被读取**，
调用点写死了字面量。修复后改为注入 `PLUGIN_CONFIG_RESOLVER_TOKEN`，在每次请求时解析配置。

修复验证（新代码加载后）：

```bash
# 改配置前
GET /views/.../data          -> summary = {"page":1,"pageSize":25}
# 把 defaultPageSize 改成 40
PUT /api/plugin/configuration {"defaultPageSize":40,...}   -> status = valid
# 再读
GET /views/.../data          -> summary = {"page":1,"pageSize":40}   ✅
```

同一路径下也验证了 `extractionTimeoutSeconds`：把它改成 600 后，超时判定窗口随之变化。

## 9. 失败重试是真实发生的

这一条刻意**没有**用改数据库状态的方式伪造，而是走真实超时路径：

1. 创建案例 `e2a919dc-5a0e-4aa2-aa0c-a0317cb8acb9`，调用 `begin_extraction`
   （状态 → `extracting`，`extractionAttempts` → 1），时间 `2026-09-17T08:52:32Z`；
2. 让它停在那里，**故意不完成抽取**，等过 `extractionTimeoutSeconds`（180s）；
3. 在 `16:55:47`（已过 180s）读视图，`failStaleExtractions` 就地把它判为失败。

读回的结果：

```
status        : draft
attempts      : 1
lastExtractAt : 2026-09-17T08:52:32.494Z
lastError     : AI 在 180 秒内没有返回任何条款，已判定本轮失败，可直接重试
clauseCount   : 0
```

UI 表现（[`assets/05-extraction-failed.png`](./assets/05-extraction-failed.png)）：
`待审查` 徽标、`审查尝试 1 次` 保留、失败原因如实呈现、可点「重试 AI 审查」。

**输入不丢**：合同正文（`contractText`）与已登记的条款都不动。

点「重试 AI 审查」后真的重新跑了一轮，并**成功**：

```
status = extracted, extractionAttempts = 2, clauseCount = 4
```

（附带一个诚实的观察：第二轮抽出的条款与第一轮并不完全相同——模型输出具有不确定性，
见 [`06-gaps-and-pr.md`](./06-gaps-and-pr.md)。）

## 10. 重启后状态与数据仍在

为让修复后的代码生效重启了整个 API 进程，重启后回读：

```
数控加工中心采购合同（CG-2026-0431）            status=confirmed  clauses=4 pending=0
数控加工中心采购合同（CG-2026-0431）· 待重试      status=extracted  clauses=4 pending=4
```

说明审查单与条款都持久化在插件自己的表里，不依赖进程内存。
