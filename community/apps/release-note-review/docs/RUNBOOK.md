# 运行与复现

## 版本与环境

2026-09-20本地检查：
- 平台HEAD：2b5756576af0f5aa9faa8e404e153fb4cd50482a。
- 插件仓库起点HEAD：9d108933273f8c9a2241a38882781a2685b6716b。
- 两仓库本地reflog均仅显示在上述提交的clone记录，支持将其记录为本地克隆起点；没有网络核验克隆当时是否为最新main。
- 插件功能分支：feat/ota-release-note-review。当前插件包含未提交文件，最终提交SHA待提交后补录。
- WSL Ubuntu-24.04，Node v24.18.0；community目录Corepack pnpm 8.15.8；平台目录pnpm 10.24.0。使用各仓库packageManager，不强行统一版本。
- 平台工作区有其他本地修改，非纯净HEAD；上述SHA不单独证明启动进程与全部源码一一对应。

## 前置条件

准备Xpert开源平台、数据库和必要基础设施，确保登录及真实模型对话可用。配置有安装权限的测试账号。先完成平台健康检查，再安装插件。

连接配置使用插件仓库community/.env；按community/env.example填写，不能将真实.env提交。示例字段见本目录env.example（仅占位，不含凭证）。system级插件使用租户管理范围及具备相应权限的登录JWT，不把组织级脚本强行用于全局插件。

## 构建与测试

在插件仓库community目录：

```bash
corepack pnpm install
corepack pnpm --filter @xpert-ai/plugin-release-note-review build
corepack pnpm --filter @xpert-ai/plugin-release-note-review test
corepack pnpm run check:entity-names
```

在插件仓库根：

```bash
node plugin-dev-harness/dist/index.js --workspace ./community/apps/release-note-review --plugin @xpert-ai/plugin-release-note-review
node scripts/check-app-view-storage.mjs
```

首次运行harness前按其README安装并构建。harness使用模拟数据库和权限，不代表真实平台验收。

2026-09-20全仓storage检查失败位置在其他应用drawio、story-studio；OTA自身禁止Web Storage的测试通过。不得报告全仓检查通过，也未为消除报错修改无关应用。

## 安装和初始化

1. 在测试宿主运行 `corepack pnpm plugin:deploy:local --help` 确认该版本支持的参数；若支持按任务书使用plugin-dir及tenant范围，并提供必要租户配置。此命令不是本次已执行成功的证据。
2. 本次实际采用平台插件页加载本地工作区；路径为WSL源码的community/apps/release-note-review。若宿主不在同一文件系统，应先让宿主可访问产物，不能给远端宿主Windows个人路径。
3. 修改后先build，再在租户默认值与治理的插件页重新加载本地OTA插件。提示重启时重启测试API并等待ready。
4. 本地API由系统级xpert-api.service管理；当前环境可用systemctl restart xpert-api.service。其他部署应使用其自己的进程管理方式，不能盲用此服务名。
5. 初始化relnote-review-assistant模板，选择实际可用模型，确认RelnoteMiddleware及其三工具、relnote工作台已绑定。发布助手后在新会话验证。
6. 已有助手不会因YAML模板变化自动同步，更新提示词需单独编辑并发布；不要每次部署都创建重复助手。

## 使用与验收

创建草稿 → 编辑并保存 → 生成 → 检查说明/每条保留风险/灰度建议 → 总确认 → 归档。刷新后检查内容和revision。归档只保存记录，不调用真实OTA。

失败测试需先通知其他使用者：暂设failureInjection=save，触发演示单保存失败；恢复none并复核后点击重试。检查releaseId不变、attempt递增、列表数量不增加。测试完成必须保持none。

细节与已执行结果见../ACCEPTANCE.md。真实截图已放入README；未验证场景没有伪造图片。
