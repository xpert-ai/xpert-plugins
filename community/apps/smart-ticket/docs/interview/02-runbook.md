# 运行与部署说明

---

## 一、 环境要求与基线

* **Node.js**：`v20.20.0`（推荐使用 Node 20 保证 ESM / CJS 模块加载最佳兼容性）
* **包管理器**：`pnpm`（支持 pnpm 8 及 pnpm 11+）
* **宿主平台**：Xpert 开源版 `main` 分支（基线 Commit SHA: `ba8736c897474f7db9a261aa5f64d95860bb9f60`）
* **插件仓库**：`xpert-ai/xpert-plugins`（基线 Commit SHA: `9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`）
* **数据库**：PostgreSQL 14+（宿主平台管理）
* **凭证安全**：所有密钥与租户 Token 均通过环境或宿主平台上下文传入，**代码中绝无硬编码任何私人凭证**。

---

## 二、 插件单包构建与测试

进入插件仓库根目录或直接进入插件目录：

```sh
# 1. 切换至插件目录
cd community/apps/smart-ticket

# 2. 严格类型检查 (TypeCheck)
pnpm run typecheck

# 3. 构建产物 (Clean -> Compile -> Copy Assets)
pnpm run build

# 4. 执行自动化单元测试
pnpm run test
```

### 构建产物清单检查
执行 `pnpm run build` 后，产物位于 `dist/` 目录：
* `dist/index.js` & `dist/index.d.ts`：插件主入口与元数据
* `dist/smart-ticket-assistant.yaml`：智能客诉工单助手 YAML DSL 模板
* `dist/lib/remote-components/smart_ticket__remote/app.js`：工作台前端交互界面
* `dist/lib/*.js`：服务端业务模块、Entity、Middleware 与 ViewProvider

---

## 三、 本地安装与六步核对规范

### 1. 部署插件到测试平台
在 Xpert 宿主根目录下执行部署指令：

```sh
corepack pnpm plugin:deploy:local \
  --plugin-dir <xpert-plugins-path>/community/apps/smart-ticket \
  --scope tenant \
  --api-url http://localhost:3000/api \
  --no-keychain
```

### 2. 规范六步验收核对表

| 顺序 | 步骤操作 | 验证标准与预期结果 |
| :---: | :--- | :--- |
| **Step 1** | **安装插件** | 部署命令返回发布成功回执，租户级插件列表中可见 `@community/apps-smart-ticket`。 |
| **Step 2** | **重启平台并验证加载** | 重启 Xpert API 宿主服务，日志中无报错，插件生命周期钩子执行正常。 |
| **Step 3** | **展示插件助手模板** | 在“新建智能体”模版市场中可检索到“智能客诉工单助手”（`smart-ticket-assistant`）。 |
| **Step 4** | **基于模板创建助手** | 点击“从模板创建”，自动生成包含 Agent 与 SmartTicketMiddleware 节点的编排画布。 |
| **Step 5** | **绑定工具与工作台** | 在助手右侧面板中，确认已成功绑定 `ticket_analyze_and_draft` 等工具，且已挂载“智能客诉工单”工作台视图。 |
| **Step 6** | **走通端到端业务闭环** | ① 对话或工作台输入客诉；<br>② AI 提取类别、紧急度与回复草稿；<br>③ 客服在工作台人工润色；<br>④ 点击确认归档落库；<br>⑤ 刷新页面原记录完整恢复；<br>⑥ 模拟异常并测试一键重试。 |

---

## 四、 环境变量示例

参考项目内同目录下的 `deploy.env.example`：

```bash
# Xpert 宿主平台 API 地址
XPERT_API_URL=http://localhost:3000/api

# 部署目标租户 / 组织标识
XPERT_TENANT_ID=tenant_default
XPERT_ORG_ID=org_default

# 插件部署认证 Token（请从本地平台后台获取，切勿提交真实 Token）
XPERT_DEPLOY_TOKEN=your_deploy_token_here

# 大模型测试环境 Key（平台端注入）
LLM_API_KEY=your_model_key_here
```
