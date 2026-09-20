# 运行说明（环境、构建、安装、使用）

## 版本与前提

| 仓库 | 用途 | SHA |
| --- | --- | --- |
| `xpert-ai/xpert`（本地测试宿主） | 开源平台 | `2b5756576af0f5aa9faa8e404e153fb4cd50482a` |
| `xpert-ai/xpert-plugins` upstream main 起点 | 插件基线 | `569512a2a316631b19e1933fff9561b470b8b2d1` |
| 本功能分支 | `feat/workorder-agentic-app` | 见 PR |

准备：PostgreSQL、Redis/Memurai、可用 LLM（实测 DeepSeek）、有插件安装权限的组织账号。  
模型 Key 只放在平台「模型提供商」，**不要**写入仓库。部署登录示例见 [deploy.env.example](deploy.env.example)。

宿主 `.env` 需允许本地插件工作区，例如：

```env
PLUGIN_WORKSPACE_ROOTS=<xpert仓库绝对路径>;<xpert-plugins>/community
```

## 构建与测试

在 `xpert-plugins/community`：

```sh
pnpm install
pnpm --filter @xpert-ai/plugin-agri-service-workorder build
pnpm --filter @xpert-ai/plugin-agri-service-workorder test
```

## 安装到本地 Xpert（六步）

| 顺序 | 操作 | 本任务结果 |
| --- | --- | --- |
| 1 | 安装插件 | UI「从本地工作区安装」：包名 `@xpert-ai/plugin-agri-service-workorder`，路径 `community/apps/agri-service-workorder` |
| 2 | 重启 API（若提示）并确认已加载 | 插件列表可见「农服工单智能填报」 |
| 3 | 展示助手模板 | 初始化后可见「农服工单助手」模板 |
| 4 | 基于模板创建并发布助手 | 已发布，模型 `deepseek-v4-flash` |
| 5 | 绑定工具 | 图中已挂载 `agri_service_*` 工具 |
| 6 | 真实模型调用 | 见 README 截图：待确认 + 待补充 |

也可在宿主根目录：

```sh
corepack pnpm plugin:deploy:local \
  --plugin-dir <插件仓库>/community/apps/agri-service-workorder \
  --scope organization --org-id <组织ID> --api-url http://localhost:3000
```

安装成功 ≠ 助手可用；必须完成模板创建与发布。

## 用户操作（演示脚本）

1. 打开「农服工单助手」对话  
2. 发送完整需求，例如：东河村三组王大叔水稻约 12 亩，叶片发黄有褐斑，怀疑稻瘟病，想尽快植保喷施  
3. 确认生成待确认工单号与结构化表  
4. 再发送：「有个农户水稻有病，帮我开单」  
5. 确认出现待补充工单与缺口列表，再补全信息重试  
