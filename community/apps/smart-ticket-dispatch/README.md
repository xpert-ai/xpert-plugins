# Smart Ticket Dispatch（智能工单分派）

一个运行在 Xpert 平台上的客服工单分派业务应用（Agentic App 插件）：客服人员提交客户问题后，AI 自动完成分诊（分类、紧急度、建议处理团队与负责人、处理建议），由**人工在审核台确认分派**后工单才会执行——AI 只建议，人来决策，全程留痕、可恢复。

## 目标用户与痛点

- **目标用户**：中小客服团队的管理员与一线客服。
- **原有工作方式**：客户问题通过邮件/电话/在线渠道涌入后，由主管逐条阅读、凭经验分类、口头指派给组员。分类口径不一致、指派无记录、高峰期漏单，问题处理进度无法追踪。
- **改善**：AI 在秒级完成结构化分诊并给出分派建议（附置信度与待补充信息提示），主管在审核台一键确认或修改，全部分派与处理动作落库，形成可审计的操作时间线。

## 核心业务流程

```
提交工单（表单/对话）
      │
      ▼
AI 分诊（smart_ticket_save_triaged_ticket 中间件工具，幂等）
      │  保存为 pending_confirmation 草稿（此时不执行任何动作）
      ▼
人工确认（审核台）──驳回──▶ rejected（流程结束）
      │ 确认分派（可修改 AI 建议的团队/负责人）
      ▼
   dispatched ──标记解决──▶ resolved
```

- **AI 的作用**：对自然语言工单做分类、紧急度评估、建议处理团队/负责人、生成处理建议与置信度，识别缺失信息（completenessTips）。
- **人的作用**：确认/修改分派、驳回、标记解决——所有执行动作都必须人工触发。
- **失败重试**：模型调用失败时不会产生脏数据；重试走同一条幂等路径（conversation + 原文哈希作为 idempotencyKey），复用已有待确认工单而不是重复建单；审核台的“重新分诊”会记录重试次数。

## 功能清单

- **工单提交视图**：表单录入客户问题，一键“提交 AI 分诊”（转发到助手对话）。
- **审核台视图**：状态筛选（待确认/已分派/已解决/已驳回 + 数量统计）、关键词搜索、工单详情（AI 建议区 + 人工确认区 + 操作记录时间线）。
- **Agent 中间件工具**：`smart_ticket_save_triaged_ticket`（幂等保存分诊草稿）、`smart_ticket_search_tickets`（搜索）、`smart_ticket_get_ticket_detail`（详情与操作日志）。
- **Assistant 模板**：`smart-ticket-dispatch-assistant`，内置分诊提示词与工具绑定。
- **持久化**：`plugin_smart_ticket` / `plugin_smart_ticket_log` 两张表，随插件自动建表；按 tenantId/organizationId 隔离。

## 运行说明

### 环境要求

- Xpert 开源版 `main` 分支（本插件基于平台 commit `182f2f4a7d05d968016a9ec20a93833687c4394f`、插件仓库 commit `63a5c222bbaa55921026dbffb858d43e5ec1570f` 开发并测试）。
- Node.js ≥ 20，pnpm（仓库内通过 corepack 管理）。
- 已配置可用的模型提供商（如通义/DeepSeek）。

### 构建

```bash
cd community/apps/smart-ticket-dispatch
pnpm install
pnpm build    # tsc 编译 + 复制 assistant yaml 与远程组件资源
pnpm test     # 类型级测试（业务规则断言见 src/lib/*.spec.ts）
```

### 部署到本地 Xpert

```bash
# 在 Xpert 平台仓库根目录执行
corepack pnpm plugin:deploy:local \
  --plugin-dir <plugin-repo>/community/apps/smart-ticket-dispatch \
  --scope <tenant-or-organization> --api-url http://localhost:3000
# 若提示需要重启，重启平台后验证
```

### 配置

插件本身不需要额外环境变量；模型凭证在 Xpert 界面「Model Providers → 对应提供商 → Setup」中通过平台配置提供（不要写入任何仓库文件）。

### 使用

1. 基于模板 `smart-ticket-dispatch-assistant` 创建助手并发布。
2. 打开助手工作台（工单分派视图）→「工单提交」提交客户问题。
3. 在对话中查看 AI 分诊结果与工单号 →「审核台」确认分派（可修改团队/负责人）→ 处理完成后「标记解决」。

## 已知限制

- 平台在 Windows 本地运行时需要少量兼容性修改（插件 ESM 动态加载、file URL 路径转换、构建脚本 shell 调用），这些修改位于平台仓库本地副本，不属于本插件 PR 的内容。
- 隔离沙箱（nsjail/isolated-vm）在 Windows 环境不可用，ClawXpert 类智能体不适用；本插件不依赖沙箱。
- 负责人推荐目前来自 AI 文本建议，未接入组织通讯录；Embedding/Rerank 模型未接入。
- 权限粒度沿用插件 organization 级声明，未实现到按钮级的细粒度权限。

## 验证结果

见 PR 描述中的“验证结果”章节。
