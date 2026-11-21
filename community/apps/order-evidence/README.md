# 订单全流程证据

在一个制造业订单 Project 内组织合同、工程、采购、计划、质量、售后六个专业 Assistant，并通过原生 Project Pipeline 保留人工决定、执行履历与证据版本。另有协调 Assistant 负责启动与说明进展。

## 当前实现

- App 与制造业订单 Project Type，七个带头像的 Assistant 模板；平台负责调度、等待、技术重试和历史。
- 六阶段依次提交判断，每阶段由配置的真实用户确认后才进入下一阶段。使用权、维护权、业务批准权分别约束。
- 服务端绑定执行身份、项目、输入摘要与版本；人工决定必须匹配准确建议摘要。证据和最终结果不可覆盖。
- 四个 Router：要求资料完整性、供应条件、质量证据、售后改进。前三个从冻结的类型化业务事实判断，条件满足后进入人工批准；不满足则留在本阶段等待补证。售后根据已被人确认的改进建议进入“待下一单验证”或“持续观察”。Router 不调用模型，也不代替人批准。
- 版本 0.2.0 使用不可变模板 1.1.0，保留旧流水线历史。原生总览把人工审核横向放在对应 Assistant 后；角色归属和授权不变。

## 演示边界

`src/fixture.ts` 是明确标注的合成业务资料。业务链覆盖订单、BOM、物料、工单、实物序列号、试验与售后证据。原生流水线、模型调用和人工确认记录实际运行；各业务阶段的物理事件是预置快照。

本插件当前不调用 SAP 或 Data Xpert 接口，不产生采购、BOM、排程或放行的生产交易。Data Xpert 本体接入属于对应 PPT 的场景方案，已有上一场景的独立实测，不应把两个范围混为一谈。下一单验证与实际业务成效尚未发生。

## 构建与安装

在 community 工作区使用其声明的 Corepack/pnpm 版本：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-order-evidence test
corepack pnpm --filter @xpert-ai/plugin-order-evidence build
corepack pnpm --filter @xpert-ai/plugin-order-evidence verify:dist
```

在已验证的 Xpert 主机运行 `plugin:deploy:local --plugin-dir <本包目录> --scope tenant`，按部署回执重启 API。通过 `assistant:suite:init --profile <本包>/blueprints/order-evidence-suite.json` 安装并发布独立角色。

插件配置 `assistants` 显式绑定六个已发布 Assistant ID，`approvers` 按相同角色键配置有权限的用户 ID 数组。所有角色都必须是该 Project 的成员。运行时还检查项目管理权限；只配置用户 ID 不会授予管理权。演示可由同一测试账号扮演各业务责任人，生产应配置真实职责分工。

创建“制造业订单项目”，添加协调者及六个专业角色，向协调者发送“请启动这张 12 台电机订单的全流程证据演示”。在原生项目任务 Pipeline 查看当前证据、人工确认或退回。演示回执以 `DEMO-DECISION-` 开头。

## 验证

区分包构建、dist 生命周期、插件运行、Assistant 发布和业务端到端完成。实际本地安装记录与截图位于任务交付的演示目录，不包含在可移植包内。

## 路由演示

正常资料使用 `scenario=standard`。缺少技术澄清的反例使用 `scenario=requirements_missing`，须在新 Project 启动，合同 Assistant 运行后停在“等待技术要求补证”。不要把已有 Project 的旧实例覆盖成新模板。

供应条件为现货足量，或现货加已确认在途达到数量；后者仅支持人工确认条件性供应方案，不能视为已入库。质量条件要求试验、合格和可追溯数量均覆盖订单且交付资料齐全。业务资料均为合成快照，Router 测试覆盖缺资料、缺件、未确认在途及质量缺证。

## 应用展示与封面

`src/app-config.ts` 是 App 展示与初始化声明的唯一维护入口，包含中英文介绍、功能亮点、使用场景、数据范围和初始化说明。封面位于 `assets/brand/`；卡片标题由宿主展示，图中只保留八字描述。

构建时 `scripts/manifest.mjs` 从实际运行元数据生成 `.xpertai-plugin/plugin.json`，同步声明封面资源。`verify:dist` 检查模板关联、manifest 一致性、PNG 格式、5 MiB 限制和打包目录。部署新版插件并按回执重启后，Explore 卡片、详情页和初始化面板使用同一张封面。

初始化应用不会自动完成业务数据接入、项目成员和业务批准人的配置；运行演示前仍需完成上文所列步骤。
