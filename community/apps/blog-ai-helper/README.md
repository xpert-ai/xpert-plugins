# Blog Article AI Helper（博客文章 AI 智能助手）

AI 博客文章智能助手 Agentic App 插件：粘贴文章草稿，AI 生成摘要、标签和标题建议，审核确认后保存，历史记录可查。

## 产品说明

### 目标用户
博客作者、内容创作者——在写完草稿后需要快速产出摘要、标签和备选标题的人群。

### 痛点
- 写完长文后手动写摘要和标签耗时
- 标题需要反复推敲，AI 可以一次给出多个备选
- 文章处理历史散落在各处，无法回溯

### 业务流程
1. **新建页**：粘贴文章草稿到文本框，点击"一键智能处理"
2. **结果页**：AI 返回摘要、标签、3 个备选标题，可"重新生成"或"确认保存"
3. **历史页**：所有已保存记录列表，点击查看详情

### AI 作用
- 调用大模型（DeepSeek）对文章内容做语义理解
- 生成 100-200 字摘要
- 提取 3-5 个内容标签
- 给出 3 个备选标题建议
- 支持重新生成（重试场景）

## 功能

- **Agent workbench 视图扩展**：三页式 React iframe 远程组件
  - 新建页：文章输入 + 一键处理
  - 结果页：AI 生成结果展示 + 重新生成/保存
  - 历史页：已保存记录列表 + 详情查看
- **Middleware 工具**：`blog_save_analysis`、`blog_report_failure`
- **数据持久化**：TypeORM 实体 `plugin_blog_ai_helper_article_record`，租户/组织隔离
- **状态机**：draft → analyzing → reviewing → saved/failed

## 运行说明

### 环境要求
- Node.js v20+
- pnpm
- Docker（PostgreSQL + Redis）
- Xpert 平台（已配置 DeepSeek API Key）

### 构建
```sh
# 在插件仓库 community/ 目录下
pnpm --filter @xpert-ai/plugin-blog-ai-helper build
```

### 本地部署
在平台仓库根目录执行：
```sh
node tools/scripts/deploy-local-plugin.mjs \
  --plugin-dir "D:\path\to\community\apps\blog-ai-helper" \
  --scope tenant \
  --tenant-id "<tenant-id>" \
  --api-url "http://localhost:3000" \
  --skip-build --skip-test
```

部署后重启 API 即可在平台"业务应用"中看到。

### 登录
- 账号：`admin@xpertai.cn`
- 密码：`admin123`

## 验证结果

| 测试项 | 结果 |
|--------|------|
| 完整业务流程（输入→AI生成→保存→历史） | 通过 |
| 数据保存与恢复（刷新不丢失） | 通过（TypeORM 持久化） |
| 空输入校验 | 通过（前端校验） |
| AI 生成失败重试 | 通过（重新生成按钮） |
| 插件构建（tsc 编译） | 通过（exit 0） |
| 类型检查（spec） | 通过（exit 0） |

## AI 协作说明

- 使用工具：豆包（Doubao）办公模式，AI Agent 协作
- 协作过程：从需求分析、代码骨架生成、前后端联调、部署排障到 README 编写，均由 AI 辅助完成
- 主要排障点：Windows 下 npm.cmd 路径问题、ESM/CJS 互操作（--experimental-require-module）、插件 artifactNamespace 配置

## 已知限制

- 仅支持 DeepSeek 模型（可通过 yaml 配置切换）
- 文章长度上限受模型上下文窗口限制（约 4K tokens）
- 不支持富文本/Markdown 解析，纯文本输入
- 截图待补充（见 docs/images/）

## 基线版本

- xpert-plugins：`63a5c222bbaa55921026dbffb858d43e5ec1570f`
- xpert 平台：`182f2f4a7d05d968016a9ec20a93833687c4394f`
