# Contract Health Check（合同智能体检）

面向**没有专职法务的中小企业**的合同风险体检 Agentic App 插件：粘贴合同 → AI 多环节体检 → 查看风险与改写建议 → 逐条确认 → 保存报告。

- 目标用户：中小企业老板 / 销售负责人 / 行政商务
- 业务问题：签合同前缺乏低成本、可复用、可追溯的风险审查能力
- AI 作用：要素抽取、风险审查、条款改写、报告摘要（结构化、可确认、可保存）

配套文档：[产品与工作流设计](docs/design.md) · [需求与验收标准](docs/requirements.md) · [AI 协作说明](docs/ai-collaboration.md)

## What It Provides

- **Workbench 视图**：合同体检工作台，包含录入、报告、历史记录三种界面状态。
- **中间件工具**：`contract_save_extraction`、`contract_save_risk_items`、`contract_save_suggestions`、`contract_save_summary`、`contract_report_failure`。
- **Assistant 模板**：`contract-health-check-assistant`，预置合同体检四环节工作流。
- **TypeORM 实体**：`ContractReview`、`ContractRiskItem`、`ContractSuggestion`、`ContractReviewJob`。
- **失败与重试**：以 `reviewId` 为幂等键的局部重试，失败环节不重复产生业务结果。

## 核心业务流程

```
新建体检(录入合同) → 开始体检 → AI 四环节处理 → 查看风险与建议
      → 逐条确认(接受/忽略/自定义) → 保存报告 → 历史记录可恢复
```

对应状态机：

```
draft → processing → needs_review → completed
                    ↘ failed → (retry 单环节) → processing
```

## 环境要求

- Node.js ≥ 18（以插件仓库配置为准），pnpm ≥ 8
- Xpert 开源版 `xpert-ai/xpert` main 分支
- 插件仓库 `xpert-ai/xpert-plugins` main 分支（Fork 后从上游 main 创建功能分支）

## 基线版本

| 仓库 | 分支 | 基线 commit SHA |
| --- | --- | --- |
| 平台 `xpert-ai/xpert` | main | `d24ca81b9f5885cf44dd77afdb0f91359b49c4ea` † |
| 插件 `xpert-ai/xpert-plugins` | main | `0be73cf89fe037ee1a8c4b1e053a94fb526738e6` |

† 平台仓库 main 在 2026-09-18 的 HEAD 即为该 SHA，此后未再变动，本项目开发（2026-09-22 起）即以该版本为准。
本地可用 `git -C <xpert 目录> rev-parse HEAD` 核对。

功能分支：`feat/contract-health-check`（本插件全部改动位于 `community/apps/contract-health-check/`）。

## 构建

在 `community/` 目录执行：

```sh
pnpm install
pnpm --filter @xpert-ai/plugin-contract-health-check build
```

构建产物：`dist/index.js`、`dist/index.d.ts`、`dist/xpert-contract-health-check-assistant.yaml`。

## 测试

```sh
pnpm --filter @xpert-ai/plugin-contract-health-check test
```

测试覆盖：输入校验、状态流转、保存与恢复、摘要失败降级、失败重试幂等、组织数据隔离。

## 端到端业务流程演示

无需 Xpert 平台和数据库，用真实构建产物跑通完整业务流程（录入 → AI 处理 → 确认 → 保存 → 恢复 → 失败重试）：

```sh
pnpm --filter @xpert-ai/plugin-contract-health-check build
pnpm --filter @xpert-ai/plugin-contract-health-check demo
```

演示覆盖 12 个环节：输入校验、新建体检、四环节任务与 Assistant 指令、AI 工具回写（抽取/审查/改写/摘要）、
状态机流转、未确认不可保存的业务约束、逐条确认、持久化保存与恢复、历史列表、失败上报与局部重试幂等、组织隔离。

完整输出见 [demo/demo-output.txt](demo/demo-output.txt)。

> ⚠️ 该演示运行在本地进程内，使用内存数据源与模拟的模型回写，**用于验证业务状态机、保存恢复、失败重试与组织隔离等业务逻辑**。
> 它不等于平台内真实运行验证 —— 平台中的实际使用流程与截图见下方 [运行截图与演示](#运行截图与演示)。

## 插件生命周期验证

在插件仓库根目录执行：

```sh
pnpm -C plugin-dev-harness install
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js \
  --workspace ./community \
  --plugin @xpert-ai/plugin-contract-health-check
```

实际执行结果（2026-09-24 复核）：

```
[plugin-dev-harness] workspace: .../xpert-plugins/community
[plugin-dev-harness] plugin: @xpert-ai/plugin-contract-health-check@0.1.0
[plugin-dev-harness] entry: .../community/apps/contract-health-check/dist/index.js
[plugin-dev-harness][plugin:@xpert-ai/plugin-contract-health-check][log] register contract health check plugin
[plugin-dev-harness][plugin:@xpert-ai/plugin-contract-health-check][log] contract health check plugin started
[plugin-dev-harness] onStart completed
ContractHealthCheckPlugin is being bootstrapped...
[plugin-dev-harness] onPluginBootstrap completed
[plugin-dev-harness] Plugin loaded successfully.
ContractHealthCheckPlugin is being destroyed...
[plugin-dev-harness] onPluginDestroy completed
[plugin-dev-harness][plugin:@xpert-ai/plugin-contract-health-check][log] contract health check plugin stopped
[plugin-dev-harness] onStop completed
[plugin-dev-harness] Application context closed
```

> ⚠️ Harness 默认包含数据库与运行能力的模拟对象，因此**不能**据此宣称真实数据库、权限或业务流程已经通过。

## 安装到 Xpert 测试平台

在 `community/` 配置 `.env`（参考 `env.example`，**不要提交真实凭证**）：

```sh
cp env.example .env
# 至少填写 XPERT_API_URL、XPERT_TOKEN，以及组织级安装所需的 XPERT_ORG_ID
set -a && source .env && set +a
```

在 Xpert host 仓库根目录执行组织级安装：

```sh
pnpm plugin:install:local \
  --workspace-path "$(pwd)/community/apps/contract-health-check" \
  --org-id "$XPERT_ORG_ID" \
  --token "$XPERT_TOKEN" \
  --api-url "$XPERT_API_URL"
```

安装后按平台流程完成：重启宿主 → 确认插件已加载 → 基于 `contract-health-check-assistant` 模板创建助手 → 绑定中间件工具与工作台视图 → 执行一次真实业务流程。

## 配置与环境变量

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `XPERT_API_URL` | 平台 API 地址 | `http://localhost:3000` |
| `XPERT_TOKEN` | 平台登录 JWT | `<jwt>` |
| `XPERT_ORG_ID` | 组织级安装标识 | `<org-id>` |

插件本身不读取模型凭证；模型由平台配置提供。

## 运行截图与演示

> **状态：待补充。** 需在 Xpert 开源版（main）中安装本插件并跑通一次真实业务流程后补齐此处截图。

截图放在 `docs/images/`（随代码提交，相对路径引用，GitHub 中可直接显示），文件名固定为：

| 序号 | 文件名 | 应展示的内容 |
| --- | --- | --- |
| 1 | `docs/images/01-intake.png` | 工作台录入页：新建合同体检、粘贴合同正文 |
| 2 | `docs/images/02-processing.png` | AI 处理中的状态（四环节进度） |
| 3 | `docs/images/03-report.png` | 体检报告页：风险清单 + 改写建议 + 风险评分 |
| 4 | `docs/images/04-confirmed.png` | 逐条确认后的保存结果 |
| 5 | `docs/images/05-history.png` | 历史记录，重新进入后恢复原记录与结果 |
| 6 | `docs/images/06-failure.png` | 异常场景：模型/环节失败的可理解提示 + 重试 |

截图齐备后，把下面这段直接替换掉本节内容（含本提示块）：

````markdown
| 录入 | 处理中 |
| --- | --- |
| ![工作台录入页](docs/images/01-intake.png) | ![AI 处理中](docs/images/02-processing.png) |

| 报告 | 逐条确认后保存 |
| --- | --- |
| ![体检报告页](docs/images/03-report.png) | ![确认并保存](docs/images/04-confirmed.png) |

| 历史记录恢复 | 失败与重试 |
| --- | --- |
| ![历史记录](docs/images/05-history.png) | ![失败场景](docs/images/06-failure.png) |

平台基线：`xpert-ai/xpert` main `d24ca81b…`；插件基线：`xpert-ai/xpert-plugins` main `0be73cf8…`。
````

## 验证结果

| 层级 | 检查项 | 状态 |
| --- | --- | --- |
| 单元测试 | 业务规则、状态流转、失败重试幂等、组织隔离 | ✅ 9/9 通过 |
| 类型检查 | `tsc -p tsconfig.spec.json --noEmit` | ✅ 通过 |
| 构建 | `tsc -p tsconfig.lib.json` + 资源拷贝 | ✅ 通过（含 `dist/index.js`、`dist/index.d.ts`、`dist/xpert-contract-health-check-assistant.yaml`） |
| 插件加载/生命周期 | `plugin-dev-harness` 加载、模块初始化、register/onStart/onStop/onDestroy | ✅ 通过 |
| 平台业务流程 | Xpert 中真实录入 → AI 处理 → 确认 → 保存 | ⏳ 待执行（见下方说明） |

### 已验证的具体命令与结果

```sh
# 构建
pnpm --filter @xpert-ai/plugin-contract-health-check build      # 通过

# 测试（类型检查 + 9 条单测）
pnpm --filter @xpert-ai/plugin-contract-health-check test        # 9 passed

# 生命周期（按任务书附录二给定的命令形式）
node plugin-dev-harness/dist/index.js \
  --workspace ./community \
  --plugin @xpert-ai/plugin-contract-health-check
# → Plugin loaded successfully. onStart / onPluginBootstrap / onPluginDestroy / onStop 全部 completed
```

第 1–3 项于 2026-09-24 在功能分支上复核通过（类型检查通过、9/9 单测通过、生命周期 4 个钩子全部 completed）。

### 尚未验证的部分（明确标注）

- **Xpert 平台内的真实业务流程**：需在装有 Xpert 开源版 main 的环境完成插件安装、助手创建、工具与工作台绑定，并执行一次真实模型调用。本仓库环境无法访问平台，未执行。
- **工作台远程组件界面渲染**：视图 provider 的清单、数据查询与动作链路已在代码层与单测中覆盖；iframe 远程组件的实际渲染需平台侧确认。
- 上述两项在完成后会补充真实运行截图与结果，不提前宣称通过。

## 复用来源与改动

- 工程结构与插件注册模式参考上游 `community/apps/procurement-quote-comparison`（AGPL-3.0）。
- 复用范围：插件入口、中间件工具定义、视图 provider、templates 与 Assistant DSL 的组织方式。
- 自有改动：业务实体、状态机、幂等重试、组织隔离、输入校验、提示词与测试均为本项目实现。

## 已知限制

- 仅支持中文合同、单文档；未做行业细分风险知识库。
- 改写建议为草案，最终以用户或律师确认为准。
- 未实现多合同对比、模板库、电子签集成。
- 权限仅按 `organizationId` / `projectId` 隔离，未实现更细粒度角色控制。
- 工作台远程组件界面需在平台侧验证渲染；仓库内先保证数据与动作链路正确。

## License

AGPL-3.0，与上游插件仓库保持一致。
