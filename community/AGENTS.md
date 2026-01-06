# Agent 开发指引

本文档说明如何在 community 工作区内创建和维护新的智能体（agent）程序。工作区采用 pnpm monorepo，推荐使用提供的脚手架快速生成包框架。

## 目录与命名
- 代理类项目统一放在 `packages/` 下，命名使用短横线风格，例如 `packages/agent-search`. 
- 包名遵循 `@community/<scope>-<name>`，其中 scope 建议为 `packages`，例如 `@community/packages-agent-search`。

## 快速创建
使用脚本创建基础包骨架（会生成 package.json、tsconfig、README、src/index.ts）：
```sh
pnpm create:package --scope packages --name agent-search --description "Search agent for notes" --public
```
参数说明：
- `--scope`：必填，限定在 tools|middlewares|models|packages 之一。agent 推荐使用 `packages`。
- `--name`：必填，使用短横线小写形式。
- `--description`：选填，简述用途。
- `--public`：选填，标记为可公开发布。缺省为受限发布。

## 代码结构建议
- `src/index.ts`：导出 agent 的工厂函数或类，例如 `createAgent()`，并暴露配置类型。
- `src/config.ts`：集中管理环境变量和默认配置，使用 `process.env` 时要给出兜底值并做校验。
- `src/handlers/`：拆分消息处理、工具调用、状态管理等逻辑，避免单文件过大。
- `test/`：为关键路径添加最小可行的单测或集成测试。

## 开发约定
- TypeScript 严格模式，保持无隐式 any、无未处理的 promise。
- 对外 API 需有最小 README 片段（如何安装、如何使用、参数示例）。
- 依赖管理：
  - 共享依赖尽量放在 root（使用 `pnpm -r add <pkg>` 保持版本一致）。
  - 仅 agent 专属的依赖放在子包内。
- 日志：使用可注入的 logger（参数或依赖注入），避免在包内直接写 stdout。
- 配置：优先通过参数传入；必须读环境变量时集中校验。

## 测试与验证
- `pnpm -r test` 运行全局测试；子包内可自定义 test 脚本（默认脚手架为占位）。
- 新增 agent 时至少包含一条 happy-path 测试，验证核心能力。

## 发布与版本
- 发布前运行 `pnpm -r build` 确保 `dist/` 生成。
- 公共包：`pnpm -r publish --filter <relative-path> --access public`。
- 私有/受限：去掉 `--access public`，或在脚手架创建时不加 `--public`。
- 遵循语义化版本。重大变更需在包内 README 记录迁移指引。

## 最小入口示例
`src/index.ts` 可以从脚手架占位开始，逐步替换为真实逻辑：
```ts
export type AgentInput = { query: string };
export type AgentResult = { answer: string };

export async function createAgent() {
  return async function runAgent(input: AgentInput): Promise<AgentResult> {
    // TODO: 调用模型或工具链
    return { answer: `Echo: ${input.query}` };
  };
}
```

## 提交前检查清单
- [ ] README 中包含安装、使用示例。
- [ ] 暴露的 API 有类型定义，入口文件无隐式 any。
- [ ] 关键路径至少 1 条测试通过。
- [ ] 版本号与 `publishConfig.access` 设置匹配预期发布策略。
