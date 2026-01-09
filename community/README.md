# Community Workspace

基于 pnpm 的多包工作区，包含工具、middlewares、模型适配与 agent 等子包。本文档说明基础用法、脚手架和发布流程。

## 准备
- 安装 pnpm（>= 8）：`npm i -g pnpm`
- 进入目录：`cd community`
- 安装依赖：`pnpm install`

## 创建子包
使用脚本生成包骨架（会创建 package.json、tsconfig、README、src/index.ts）：
```sh
pnpm create:package --scope tools --name demo-tool --description "Example tool" --public
```
参数：
- `--scope`: tools | middlewares | models | packages
- `--name`: 子包目录与包名尾缀（自动转为小写短横线）
- `--description`: 可选描述
- `--public`: 可选，生成时将 `publishConfig.access` 设为 public

生成后可直接在子包内填充代码、依赖和测试。

## 常用脚本
- 安装依赖：`pnpm install`
- 构建全部子包：`pnpm -r build`
- 运行测试：`pnpm -r test`
- 运行 lint：`pnpm -r lint`

## 发布流程
1. 确认已登录 npm：`npm whoami`（若未登录使用 `npm login`）。
2. 构建：`pnpm -r build`
3. 单个子包发布（示例发布 tools/demo-tool）：
   ```sh
   pnpm -r publish --filter ./tools/demo-tool --access public
   ```
   - 若创建时未添加 `--public`，可省略 `--access public` 以私有/受限方式发布。
4. 发布后检查 npm 页或安装验证：`pnpm add @community/tools-demo-tool`

## 结构约定
- `tools/`：具体工具实现（如 parser、converter）。
- `middlewares/`：请求/响应管线中间件。
- `models/`：模型适配或代理层。
- `packages/`：其他通用包或 agent。
- `scripts/`：仓库辅助脚本（如 create-package）。

## 故障排查
- 路径或导入报错：确认子包 `tsconfig.json` 的 `extends` 指向根的 `tsconfig.base.json`，且 `rootDir` 为 `src`。
- 构建输出缺失：确保子包有 `src/index.ts`，并在 package.json 中 `files` 包含 `dist`。
- 版本/权限异常：检查子包 `publishConfig.access` 与实际发布命令是否一致。
