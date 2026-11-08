# @xpert-ai/plugin-weekly-radar — 周报风险雷达

> 把本周真实发生的事情沉淀为可追踪条目，用**可复算的规则**扫描未闭环风险，并生成一份**数字不会漂移**的周报。

---

## 1. 产品说明

### 1.1 用户与痛点

- **用户**：带团队的中层与基层管理者、项目负责人、需要每周向上汇报的人。
- **痛点**：周报最难写的从来不是"这周干了什么"，而是**上周哪些没闭环、哪些结论还没有人确认、哪些结论其实已经失败不可信**。这些信息散在会议结论、聊天记录、自己的备忘里，人不会主动写进周报，于是风险往往在最后一刻才被老板问出来。
- **原方式**：翻聊天记录 + 凭记忆拼周报；风险靠临场回想；上周说过的事下周没人再提。
- **新方式**：本周发生的事随手沉淀成**条目**（带状态与证据指针）→ 雷达按规则扫出**未闭环状态**（跨周未闭环 / 待确认积压 / 失败未重试 / 逾期未动 / 反复受阻）→ 周报里的数字与风险行由服务端重算，不会和事实漂移。

### 1.2 核心主张（与其它 AI 工作台的真正差别）

> **模型只负责写叙述，判定归规则。**

- 模型（宿主助手）做两件事：从用户说的话里抽取**条目事实**；把条目写成**周报叙述**。
- 规则引擎（服务端、纯函数、可单测）做判定：什么是风险、风险多严重、滞留几天、是否反复受阻。
- 周报里的**所有数字与风险行在服务端重算**，模型无法编造、无法改写。
- 于是每条风险都满足三件事：**可复算**（同样数据重放得到同样结论）、**可追溯**（带证据指针与规则编号）、**可背责**（谁来确认、何时确认都留痕）。

### 1.3 与平台既有产品的边界（刻意不做）

| 不做 | 原因 |
|---|---|
| 会议转写 / 会议纪要 | 官方 Meetings 已覆盖 |
| 通用看板 / 报表 | 官方 Live Dashboard 已覆盖 |
| 文档美化 / PPT 产出 | 官方 Office、Presentation Studio、Story Studio 已覆盖 |
| IM 接入、OKR 拆解、协作评论、绩效 | 超出"周报风险雷达"内核，见「已知限制」 |

### 1.4 明确取舍

1. **不做通用抽取式工作台**：仓库里同类形态已很多，本插件只保留"未闭环状态"这一个纵切面。
2. **风险条目数控制在 5 条规则内**：宁可少报，也不产生"AI 泛泛而谈的风险"。
3. **录入摩擦优先压到最低**：一次粘贴 = 一条条目候选；宁可少抽字段，也不让用户填表。
4. **不确定就说不确定**：用户没提到的负责人 / 截止日期不推断，先追问一次。

---

## 2. 数据模型

两张表，表名由 SDK `pluginArtifactTableName()` 生成（`plugin_weekly_radar_entry` / `plugin_weekly_radar_weekly`），均含可空 `tenantId` / `organizationId` 与复合索引。

| 表 | 关键列 | 说明 |
|---|---|---|
| `plugin_weekly_radar_entry` | `operationId`（唯一）、`weekKey`、`title`、`status`、`owner`、`dueDate`、`evidenceRef`、`evidenceQuote`、`lastTouchedAt` | 一条工作事实。`operationId` 唯一索引保证重试不产生重复条目 |
| `plugin_weekly_radar_weekly` | `weekKey`（唯一）、`highlights`、`nextActions`、`metrics`(jsonb)、`riskSnapshot`(jsonb)、`status` | 一周的周报。`weekKey` 唯一 → 生成即 upsert |

**条目状态机**：`planned → in_progress → blocked / pending_confirm / ai_failed → done`
**周报状态机**：`draft → confirmed`（必须人工确认才归档）

---

## 3. 风险规则（服务端，可复算）

| 编号 | 规则 | 触发条件 | 级别 |
|---|---|---|---|
| R1 | 跨周未闭环 | 非 `done` 且创建周 < 当前周 | 按滞留天数 low / medium / high |
| R2 | 待确认积压 | `pending_confirm` 超过阈值天数 | medium / high |
| R3 | 失败未重试 | `ai_failed` 且未重试（结论不可信） | high |
| R4 | 逾期未动 | `dueDate` 已过且非 `done` | medium / high |
| R5 | 反复受阻 | 同一事项在 ≥2 个不同周都 `blocked` | high（结构性问题） |

- 同一条目命中多条规则 → **合并为一条风险**，保留多个原因编号。
- 阈值可在插件 `config` 中由管理员调整（`pendingConfirmDays` / `overdueGraceDays` / `crossWeekHighDays` / `crossWeekMediumDays`）。
- 规则实现是纯函数（`src/lib/rules.ts`），有独立断言脚本，**无需安装平台 SDK 即可运行**。

---

## 4. Agent 工具与助手模板

| 工具 | 作用 | 幂等设计 |
|---|---|---|
| `radar_upsert_entry` | 沉淀 / 更新一条工作条目 | 创建由 `(tenantId, organizationId, operationId)` 唯一索引兜底；更新写绝对值，天然幂等 |
| `radar_scan_risks` | 用规则引擎扫描，返回风险 + 滞留天数 + 指标 | 纯查询，可任意次重放 |
| `radar_generate_weekly` | 组装周报（数字与风险行服务端重算） | `weekKey` 唯一 → 覆盖式更新 |
| `radar_confirm_weekly` | 人工确认后归档周报 | 状态置位幂等 |
| `radar_list_entries` | 分页查询条目 | 只读 |

助手模板 `xpert-weekly-radar-assistant.yaml` 明确写入工作规则：**只记录用户明确说过的事实**、**风险段只能来自 `radar_scan_risks` 的结果**、**叙述里不得改写数字**、**必须人工确认才归档**。

---

## 5. 工作台（Weekly Radar Workbench）

1. **指标区**：条目总数、未闭环数、风险数、高危数（全部来自服务端）。
2. **本周条目 + 风险雷达**：条目表（可改状态、负责人）、风险卡片（级别、规则编号、滞留天数、证据指针、建议动作）。
3. **周报区**：助手撰写的"本周要点 / 下周动作" + 服务端重算的风险行 + 历史周报 + 生成 / 确认按钮。

---
## 6. 运行说明

### 6.1 环境要求

- Node.js LTS（平台 CI 锁 `20`）
- pnpm（社区工作区锁 `pnpm@8.15.8`，通过 corepack 自动切换）
- 已启动的 Xpert 本地环境（API `3000`，就绪检查 `http://localhost:3000/api/health/ready`）

### 6.2 构建与部署

```bash
# 1) 安装依赖（仓库根）
corepack pnpm install

# 2) 单插件构建
corepack pnpm --filter @xpert-ai/plugin-weekly-radar build

# 3) 规则引擎断言（不需要平台 SDK）
corepack pnpm --filter @xpert-ai/plugin-weekly-radar test:rules

# 4) 部署到本地平台（凭证只走环境变量）
export XPERT_USERNAME=... XPERT_PASSWORD=...
corepack pnpm plugin:deploy:local \
  --plugin-dir <repo>/community/apps/weekly-radar \
  --api-url "$XPERT_API_URL" \
  --scope tenant --tenant-id "$XPERT_TENANT_ID" \
  --manifest-file /tmp/plugin-deployment.json
```

> 部署返回 `staged successfully` **不等于**已运行。若 `restartRequired: true` 或描述符 `loadStatus: pending_restart`，需重启 API 后再验证插件加载。

### 6.3 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `WEEKLY_RADAR_PENDING_CONFIRM_DAYS` | 3 | 待确认条目多少天后算风险 |
| `WEEKLY_RADAR_OVERDUE_GRACE_DAYS` | 0 | 逾期宽限天数 |

### 6.4 六步冒烟（面试演示脚本）

1. 安装插件 → 2. 重启 API 并验证加载 → 3. 打开助手模板 → 4. 基于模板创建助手 → 5. 绑定工具与工作台 → 6. 真实模型调用 + 人工确认 + 刷新恢复。

---

## 7. 验证结果

### 已验证（本仓库内可复现）

| 项 | 结果 | 方式 |
|---|---|---|
| 规则引擎断言（R1–R5、原因合并、确定性重放、ISO 周次） | 通过 | `pnpm test:rules`（`node --experimental-strip-types src/lib/rules.spec.ts`，本机实跑输出 `rules smoke test passed`） |
| 查重 | 通过 | 对 `xpert-ai/xpert-plugins` 全量 **824 个 PR**（54 open / 728 merged / 42 closed）标题+正文正则扫描：`风险雷达/risk radar`、`项目风险/延期/里程碑`、`周报/weekly report` 均 **0 真实命中** |
| 表名合规 | 通过 | 全部走 `pluginArtifactTableName()`，避免 pre-commit `check-plugin-entity-tables` 拦截 |
| 租户隔离 | 代码级通过 | 所有读取走 `scopeWhere()` / `applyScopeToQueryBuilder()`，写入填充 `tenantId` / `organizationId` |

### 未验证（必须在真实环境补做，诚实披露）

- 平台内五场景验收（完整流程 / 保存恢复 / 空态 / 失败重试 / 权限隔离）**尚未在真实平台执行**。
- 运行截图**尚未产出**（需要平台环境与演示数据）。
- `pnpm build` 与 `plugin:deploy:local` 需在真实仓库工作区执行后确认（当前为脱离 workspace 的骨架副本）。
- `plugin-dev-harness` 生命周期验证未执行。

---

## 8. AI 协作说明

1. **怎么给上下文**：先用仓库里的 `community/apps/crm`（结构蓝本）、`valve-business-workbench`（`operationId` 幂等与命名空间范本）、`material-identity-governance`（tenant 级 + artifactNamespace 范本）作为锚点再动手，避免凭印象猜 SDK 用法。
2. **做了哪些选择与调整**：把"周报风险雷达"从"从周报文字抽风险"改成"**从未闭环状态算风险**"——前者与仓库里 40 多个抽取型工作台同构且无增量；后者在 824 个 PR 全量查重中 0 命中。同时把"模型下结论"改成"**模型写叙述、规则做判定**"，并把周报数字改为服务端重算，避免模型编造数字。
3. **怎么一起定位解决**：逐条对齐 `pluginArtifactTableName`、唯一索引幂等、`scopeWhere` 过滤、`@ViewExtensionProvider` manifest 字段、`hostEvents` 订阅、iframe 内禁用存储等既有模式，全部以仓库真实源码为准，而不是凭文档描述。
4. **怎么测试确认**：规则引擎写成纯函数并配独立断言脚本（不依赖平台 SDK 即可运行），逐条覆盖 R1–R5、原因合并、确定性重放与 ISO 周次，本机实跑通过。

---

## 9. 已知限制

- **未接入 IM**：当前输入为用户粘贴或助手抽取，条目来源的"自动采集"尚未实现（避免依赖外部凭证导致演示不可复现）。
- **单组织场景**：已实现租户 / 组织隔离，但未验证多组织并发下的 UI 表现。
- **风险只有 5 条规则**：不做自然语言风险推测，边界之外的风险不报。
- **周报产物只有数据与叙述**：未导出 Word / Excel，未推送到 IM。
- **规则阈值全局生效**：暂不支持按项目 / 团队差异化配置。
- **不接外部系统**：不发送邮件、不同步项目管理工具、不代替审批。

---

## 10. 复用与许可声明

- 本插件为**独立原创实现**，未复制其它插件的业务代码。
- 结构与工程规范参照仓库内既有开源示例（`community/apps/crm`、`community/apps/valve-business-workbench`、`community/apps/material-identity-governance`），仅参照其**公开的工程约定**（插件六件套结构、命名空间与幂等写法、视图 manifest 形状、构建脚本链）。
- UI 基础设施（React UMD shim、iframe 桥接协议、esbuild 打包脚本）沿用仓库既有约定，与上述示例同源。
- 仓库整体许可为 **AGPL-3.0**，本插件遵循相同许可。
