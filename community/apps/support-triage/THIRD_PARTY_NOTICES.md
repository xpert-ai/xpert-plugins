# 开源来源与许可

本插件采用 AGPL-3.0，与上游 xpert-ai/xpert-plugins 一致。仓库根目录 LICENSE 为完整许可文本。

## 参考和复用

| 来源 | 许可 | 本插件的使用范围 |
| --- | --- | --- |
| xpert-ai/xpert-plugins 的 Dockyard | AGPL-3.0 | 参考现代插件入口、作用域、View Provider、TypeORM 和模板组织方式；工单领域实现另行编写 |
| xpert-ai/xpert-plugins 的 Smart Maintenance 等示例 | AGPL-3.0 | 参考 `assistant.chat.send_message` 的宿主命令和工具协作方式 |
| 同仓库 `packages/shadcn-ui` | AGPL-3.0 | 复用公开 React 控件、主题桥接和样式；在当前仓库构建后打包使用 |
| Xpert plugin-sdk / contracts | AGPL-3.0 | 使用宿主插件、视图、模板和智能体类型，作为 peer dependencies |
| React、TypeScript、Tailwind CSS、esbuild、Zod、NestJS、TypeORM、SQL.js | 各自分发包中的开源许可 | 界面、编译、校验、服务、持久化和测试；保留依赖各自许可证 |

工单状态机、分析批次与失败恢复、证据校验、人工确认、客服界面和相关测试是本次开发内容。实现由 Codex 辅助完成，详见 [AI 协作记录](docs/ai-collaboration.md)。未复制第三方业务数据；示例工单为合成文本。

上游链接：

- https://github.com/xpert-ai/xpert-plugins
- https://github.com/xpert-ai/xpert
- https://github.com/xpert-ai/xpert-skills

开发时记录的固定 SHA 见 README；请从对应版本核对参考代码。当前未向 npm 发布包。
