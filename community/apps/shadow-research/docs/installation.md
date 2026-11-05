# 安装与配置

## 环境

使用开源 Xpert main，记录实际提交 SHA。准备 PostgreSQL、Redis、可用模型、组织和有租户插件安装权限的测试账号。按平台仓库说明启动，不需要迁移原股票系统。

本次验证：Node 22.23.4；平台 pnpm 10.24.0、SDK/contracts 3.30.2。插件声明兼容 ^3.18.4，独立开发构建使用 3.18.4，真实加载使用平台 3.30.2。不是已验证所有中间版本。

## 构建和源码安装

先执行 README 的构建与测试。平台仓库中运行官方命令：

```sh
corepack pnpm plugin:deploy:local --help
corepack pnpm plugin:deploy:local --plugin-dir /absolute/path/xpert-plugins/community/apps/shadow-research --scope tenant --tenant-id YOUR_TENANT_ID --api-url http://localhost:3000
```

按该版本 CLI 的帮助和官方 Skill 配置部署凭据；使用环境变量或平台配置，不写进源码。`env.example` 仅是占位示例。宿主须允许读取该绝对源码目录。

如结果标记 restartRequired 或 pending_restart，重启 API 后确认插件为 loaded，再初始化 Assistant。安装插件并不会自动创建或发布助手。

## 创建助手

1. 选择正确组织，在私有工作区导入本包 `src/assistant.yaml`。
2. 选择已配置且支持工具调用的聊天模型。通义千问插件的 API Host 填纯 HTTPS 域名，它会追加兼容接口路径；地域须与凭据匹配。其他供应商遵循其当前表单契约。
3. 确认画布存在助手节点、ShadowResearchMiddleware 节点及二者 workflow 连线。不要删除中间件来消除其他检查项。
4. 模板已关闭文件理解，无需为本流程额外配置嵌入模型。递归预算为 120，默认双栏及研究视图；已有个人布局可覆盖默认值。
5. 保存草稿、处理发布检查、填写足够长的发布说明并发布。
6. 进入 Bosi。若只有聊天，点击右上角“打开视图”（叠放方框）并选择“选股研究”。这不同于聊天附件。

## 平台集成验收脚本

仅对本地测试实例执行。填写 `env.example` 的测试变量，通过环境加载，然后运行：

```sh
node community/apps/shadow-research/tests/platform-smoke.mjs
```

脚本创建一条明确标记的模拟故障任务，通过平台官方中间件工具测试 API 注入 tool_failed，验证重试保持原任务与输入。不调用模型，不把该测试当成真实模型业务结论；测试记录保留供检查。完整模型验收还需按演示步骤运行并人工确认。
