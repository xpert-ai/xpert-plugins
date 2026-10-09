# AI 协作说明

## 用的什么

全程使用 **Claude Code**（终端里的 agentic coding 工具）作为主要开发与排查工具，
配合宿主的源码与运行日志。模型调用通过平台自身配置的 Provider 完成（本次为 `minimax`）。

## AI 具体帮上了什么

| 环节 | 说明 |
| --- | --- |
| **读懂平台契约** | 插件开发没有现成教程。AI 从 `packages/plugin-sdk`、`packages/contracts` 里把 `XpertPlugin` 契约、`IXpertViewExtensionProvider` 接口、视图数据信封（`items`/`item`/`total`/`summary`）、`clientCommands` 协议一条条读出来，拼成可用的实现。 |
| **定位"看不见"的故障** | 工作台视图接口返回 200 但面板不渲染。AI 反混淆前端的 `chatkit-ui` 打包产物，找到了筛选条件 `e.workbench?.fixed !== false && e.view.type === 'remote_component' && e.view.component.isolation === 'iframe'`，最终定位到真正原因是**面板需要点「打开视图」按钮**才展开。 |
| **驱动真实浏览器验证** | 用 Playwright 走完"登录 → 打开工作台 → 逐条确认/修改/驳回 → 保存"的完整人工流程，并驱动失败重试场景。 |
| **写可复现的验证脚本** | 每次结论都落成一个可重跑的脚本，而不是"我看了一眼没问题"。 |

## AI 走过的弯路（这部分更值得记）

诚实记录三次判断失误，以及是怎么纠正的：

### 1. Bun 启动平台的连锁故障（最大的坑）

最初用 `bun` 启动 API，症状是一堆**看起来毫不相关**的报错：`/api/user/me` 500、
`/api/xpert` 403、创建 workspace 报 `User scope is required`、模板安装报 `Tenant context is required`。

AI 一开始在权限配置、租户上下文、路由上分别找原因，都属于治标。真正的转折是去读
`PermissionGuard` 的日志，发现 `userId=unknown, tenantId=unknown, roleId=unknown`——
所有作用域都是空的，说明问题不在某一个接口，而在**请求上下文整体失效**。
顺着 `RequestContext` → `cls-hooked` → Node `async_hooks` 这条线，才定位到是 Bun 的实现差异。

改用 `node dist/apps/api/main.js` 后，上述故障**全部同时消失**。

> 教训：多个不相关模块同时报"拿不到上下文"，应优先怀疑上下文基础设施，而不是逐个接口排查。

### 2. 差点把"没验证过的截图"写进文档

第一版 README 里我准备用 `63-partial-save-guard.png` 来证明"未处置条款拒绝落库"。
实际打开看才发现：那张图**根本没有拍到拒绝提示**——错误横幅渲染在面板顶部，
而当时页面滚动到了条款区，横幅在可视区之外。图里只有条款卡片。

AI 没有直接采信文件名和脚本日志（脚本确实打印了"点击保存"，看起来像成功了），
而是逐张打开截图核对内容，发现不符后重新设计截图流程（保存后显式滚回顶部），
并用新图替换。**文件名和日志都不能替代"亲眼看一眼"。**

### 3. 把"已正确安装"误判为"代码已生效"

修完配置缺陷后重新安装插件，安装响应显示 `state: loaded`、`generation` 递增，
看起来一切正常，但配置改了仍然不生效。

真实原因是两层：其一，我只跑了 `tsc --noEmit`（仅类型检查），**`dist/` 里还是旧代码**；
其二，即使产出新 revision，平台的 `RuntimeRestartCoordinator` 在单副本本地开发场景下
会记 `reason: "already-current"` 并**直接判定收敛完成、不真正重启进程**。

两个原因都藏在日志细节里（`ESM import failed ... Cannot find module` 以及
`"reason":"already-current"`），只有去读 API 日志才能发现。修正后配置改动确实生效了
（`pageSize` 25 → 40）。

> 这三条都指向同一个结论：**AI 产出的"看起来成功"必须用独立证据核对**——
> 看数据库里的真实行、看 API 日志里的真实原因、看截图里的真实像素。

## 人负责的部分

- **产品判断**：为什么做"审查台"而不是"抽取工具"——因为合同审查的本质是责任归属，
  结论必须由人确认（见 [`01-product.md`](./01-product.md)）。
- **范围取舍**：明确不做 PDF 解析、审批流、模板比对（评分标准说明功能多不加分）。
- **验证口径**：坚持失败重试场景走真实超时路径，而不是改数据库行造一个"失败态"出来；
  坚持每条结论都要有可重跑的命令或可核对的数据。
- **凭证管理**：所有密钥走环境变量 / 平台配置，仓内与文档中不含真实凭据。

## 主要参考（平台源码位置）

| 内容 | 位置 |
| --- | --- |
| 插件契约与 SDK | `xpert/packages/plugin-sdk/src/lib/core/` |
| 视图扩展接口与信封类型 | `xpert/packages/contracts/src/` |
| 插件安装 / 配置 resolver | `xpert/packages/server/src/plugin/plugin-config.resolver.ts`、`plugin.controller.ts` |
| 远程组件协议 | `xpert/packages/contracts`（`xpertai.remote_component`, protocolVersion 1） |
| 仓库内同类实现参考 | `xpert-plugins/community/apps/crm`（骨架与构建脚本来源） |
