# Browser layer (界面集成 / 平台业务流程)

这两层不能只靠接口验证：文档要求"使用真实构建的界面资源验证表单、状态、数据查询和动作桥接"，
并且"明确标注模拟数据与未验证部分"。这里的脚本就是把这个过程变成可重复执行的。

## 它验证什么

| 脚本 | 层 | 断言的东西 |
| --- | --- | --- |
| `capture-chat.mjs` | 界面集成 + 平台业务流程 | 真实模型被真实工具驱动：`list_pending_tickets` 返回工单表格，`propose_ticket_triage` 把建议写进库，助手明确"等待人工确认" |
| `capture-board.mjs --stage persisted` | 保存与恢复 | 重启 API 后看板仍是同一批记录与修订号 |
| `capture-board.mjs --stage empty` | 输入与空状态 | 没有数据时给出明确提示与"载入演示工单"入口，不是空白页 |
| `capture-board.mjs --stage failed` | 失败与重试 | 分诊失败时显示失败原因与"重试分诊"入口 |
| `capture-board.mjs --stage retry` | 失败与重试 | 点重试后回到待处理，`attemptCount` 增加，**不新增第二张工单** |

## 前置条件

1. 插件已构建：`corepack pnpm run build`（产出 `dist/remote/ticket-triage.html`）。
2. 插件已部署并在平台启用，助手与视图已创建（见 `docs/interview/02-runbook.md`）。
3. `playwright-core` 可用。平台的 `node_modules` 里就有一份，直接指路径即可，不用另装浏览器：

```bash
export PLAYWRIGHT="file:///C:/xpert/xpert/node_modules/playwright-core/index.mjs"
```

脚本用 `channel: 'chrome'` 驱动系统 Chrome（`CHROME_CHANNEL` 可改），因此不需要 `playwright install`。

## 起宿主的两种方式

**A. 平台自带外壳**（推荐，配了 app platform 的环境用这个）——直接访问 `/chat/x/<assistant>/c`，
脚本里的 `HOST_URL` 指过去即可，`tests/browser/host.html` 不需要。

**B. 本项目自带的最小宿主**（没有 app platform 配置时用）：

```bash
XPERT_API_URL=http://127.0.0.1:3000 \
XPERT_EMAIL=you@example.com XPERT_PASSWORD=... \
XPERT_TENANT_ID=<tenant-uuid> XPERT_ORG_ID=<org-uuid> \
XPERT_XPERT_ID=<assistant-id> \
node tests/browser/serve-host.mjs
# -> http://127.0.0.1:4310
```

宿主只做四件事：握手回 `init`、`requestData` 转发到 `GET .../views/<key>/data`、
`executeAction` 转发到 `POST .../views/<key>/actions/<actionKey>`、`resize` 调整高度。
组件、数据、动作都来自插件本身，只有外壳是替代品——`README.md` 与
`docs/interview/03-validation.md` 都标注了这一点。

## 两个需要手工造的状态

`empty` 和 `failed` 在正常操作里不会出现（一个要清空、一个要模拟一次分诊失败），
所以要先用 SQL 造出来。表名是 `plugin_ticket_triage_ticket`，身份列是
`tenantId / organizationId / xpertId`：

```sql
-- 空状态：清掉该助手名下的工单
delete from plugin_ticket_triage_ticket
 where "xpertId" = '<assistant-id>';

-- 失败与重试：把一张工单标成失败（模拟一次模型/外部服务失败）
update plugin_ticket_triage_ticket
   set status = 'failed', "lastErrorCode" = 'model_timeout',
       "attemptCount" = "attemptCount" + 1
 where "xpertId" = '<assistant-id>' and "ticketCode" = 'T-1003';
```

`--stage retry` 会点看板上的"重试分诊"，走的是 `reset_ticket` 动作：
工单回到 `pending`、`lastErrorCode` 清空、`attemptCount` 保留递增，
**同一行被复用，不会产生第二张工单**。

## 保存与恢复怎么验

```bash
# 1. 记下当前看板
node tests/browser/capture-board.mjs --stage persisted
# 2. 重启 API（Windows 示例）
PID=$(netstat -ano | grep ":3000" | grep LISTENING | awk '{print $5}' | head -1); taskkill //F //PID $PID
cd <platform-repo> && node dist/apps/api/main.js
# 3. 再看一次：与第 1 步的每张工单状态、修订号逐条一致
node tests/browser/capture-board.mjs --stage persisted
```
