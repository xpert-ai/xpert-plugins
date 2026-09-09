# 物料主数据智能治理

汽车零部件制造企业的一物多码、一码多物和研发新增防重治理 App。包含八位独立 Xpert Assistants、七条直接 required External Xpert 连线、真实任务记录、人工审批以及程序化 Mock MDM 和 ERP 发布。

三个工作台视图：治理监控、案例协同流水线、证据与治理审批。生产 TSX 同时用于原型预览和插件远程组件；使用共享 shadcn UI、宿主题色、ECharts 和官方 Workbench bridge。

## 依赖和兼容范围

本版本需要同一工作区内已加入 Assistant Suite 初始化契约的 xpert-pro，以及配套 DataXpert 应用初始化和执行记录页面改动。单独安装插件到尚不支持这些契约的旧宿主不会自动获得套件初始化能力。

公开依赖最低要求为 `@xpert-ai/plugin-sdk@3.18.3` 和 `@xpert-ai/contracts@3.18.2`。这些已发布 npm 包包含 `ProjectAccessRuntimeCapability`、`XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN` 与 Assistant Profile 契约；构建直接使用声明的公开依赖。

```sh
# 在此插件目录
corepack pnpm install --ignore-scripts
corepack pnpm verify:blueprint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

随后在 xpert-pro 中使用官方部署 CLI：

```sh
corepack pnpm plugin:deploy:local --plugin-dir /path/to/xpert-plugins/community/apps/material-identity-governance --scope tenant --config '{"mode":"mock","debug":false}'
```

按 CLI 提示重启已确认的本地宿主。不要复制其他环境的 token、数据库账号或真实 ERP 凭据。

## 初始化和使用

1. 在 DataXpert 插件详情中安装本 App，点击初始化应用。组织应配置可用主模型；本演示不要求向量模型和视觉模型。
2. 预检和初始化完成后，打开物料主数据智能治理。套件会逐一发布七位角色，再建立协调者的直接 External Xpert 连接。
3. 新建汽车零部件治理案例，选择三种场景之一。每个案例会建立自己的 Project 和助理分配。
4. 点击协调者推进下一步；也可在就绪任务卡内单独启动某个角色，或从该角色自己的 Assistant 入口提供案例 UUID 执行。
5. 查看来源记录、逐属性候选比对、发布图纸和业务影响。流水线在人工审批门暂停。
6. 有 Project 管理权限的用户填写审批意见。批准后再推进发布，查看 Mock MDM 与 ERP 确认回执。
7. 点击执行圆点打开那一次平台执行规划记录，再查看对应会话中的真实工具输入、结果或异常。

## 验证范围

首轮三个真实平台案例均完成 revision 10，每案例 10 次成功执行、两份 Mock 系统确认回执，八个独立 Assistants 全部覆盖。规则测试覆盖单位等价、合法别名、硬冲突、缺失证据、近似不可合并、图纸防重、审批版本、越权字段和 JSONB 字段重排。

Mock 图纸由程序生成 SVG 和结构化标注。当前没有通用扫描件 OCR、CAD 几何解析、跨企业向量检索或真实交易系统写回。详见 [架构和能力边界](docs/architecture.mdx)。

开发过程和产品使用手册在交付目录 `outputs/material-identity-governance/manuals`，验收回执和截图在同目录的 `acceptance` 与 `screenshots`。

## Assistant Profile 资料卡

八位助理分别提供活动与待办视图，共 16 个 `agent.profile.tabs` 扩展。协调者与治理专员支持受项目管理权限保护的人工快捷审批。详见 [资料卡使用说明](docs/assistant-profile.mdx)。

`@xpert-ai/contracts@3.18.2` 已提供 `AGENT_PROFILE_TABS_SLOT`、`XpertAssistantProfile` 与可信 Assistant 版本族上下文。运行宿主也需要支持这些契约及 SDK 项目访问能力。
