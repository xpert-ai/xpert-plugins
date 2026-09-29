# 第三方声明 / Third-Party Notices

本插件未捆绑任何第三方源码、编辑器或前端库（无 `vendor/`）。仅使用以下公开依赖，按其既有许可链接使用，不改动其源码：

| 依赖 | 用途 | 许可 |
| --- | --- | --- |
| `@xpert-ai/plugin-sdk`, `@xpert-ai/contracts` | 插件入口、`ViewExtensionProvider`、`AgentMiddlewareStrategy`、`pluginArtifactTableName` 等公共 API | 以 Xpert 开源仓库许可为准 |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/typeorm` | 服务端模块、依赖注入 | MIT |
| `typeorm` | 实体与仓储持久化 | MIT |
| `@langchain/core`（`tool`） | 定义助手可调用工具 | MIT |
| `zod` | 业务契约与输入校验 | MIT |

作品整体许可为 AGPL-3.0，与 `xpert-plugins/community/apps` 约定一致。业务选题、数据模型、界面与逻辑均为原创，未复制示例应用源码。
