# 来源、许可、基线与 Git 交付说明

---

## 一、 起始代码基线与 Commit SHA

本次开发严格按照任务书要求，基于开始开发时获取的两个官方仓库 `main` 分支最新代码展开：

| 仓库名称 | 远程仓库地址 | 基线 Commit SHA | 作用与用途 |
| :--- | :--- | :--- | :--- |
| **Xpert 开源宿主** | `https://github.com/xpert-ai/xpert` | `ba8736c897474f7db9a261aa5f64d95860bb9f60` | 本地开源宿主运行环境 |
| **Xpert 插件仓库** | `https://github.com/xpert-ai/xpert-plugins` | `9bfa96594a3debbb33f0ba25c7ade49e7d360c8b` | Fork 起始分支与功能插件主战场 |

> [!NOTE]
> 记录上述基线版本旨在确保招聘方评审时具有完全一致的运行环境，达到 100% 可复现标准。

---

## 二、 开源许可与复用声明

* **开源协议**：本项目插件声明采用 **AGPL-3.0**（与官方 `xpert-plugins` 仓库许可完全保持一致）。
* **复用范围说明**：
  * 复用了 `@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 的标准接口、生命周期类型定义与 `renderRemoteReactIframeHtml` 渲染工具。
  * 复用了官方 `community/` 目录的标准包目录结构与 `create:package` 脚手架规范。
* **自有代码实现**：
  * 全量自研实现了智能客诉分析业务逻辑（`TicketService`）、实体模型（`TicketRecord`）、Agent 工具中间件（`SmartTicketMiddleware`）、工作台视图提供者（`TicketViewProvider`）、交互式 React 远程组件（`app.js`）、Assistant YAML DSL 模板与配套自动化测试套件。
  * **代码中绝无引入任何不合规的三方代码或私有闭源库**。

---

## 三、 Git 分支管理与 PR 交付规范

* **分支规范**：基于上游 `main` 分支检出独立功能分支 `feat/smart-ticket-agentic-app`。
* **代码纯净度**：
  * 改动范围完全收敛在 `community/apps/smart-ticket/` 目录内，未污染仓库其他目录或已有应用。
  * 排除了临时文件、日志、本地开发配置，构建产物 `dist/` 与测试文件整洁清晰。
* **交付目标**：
  * 从该独立功能分支向 `xpert-ai/xpert-plugins` 的 `main` 分支发起 PR。
  * 交付最终 PR 链接，按任务书要求**无需合并**。
