# 部署复现与已知本地偏差

正常入口是宿主 `plugin:deploy:local`，安装 scope 必须匹配本插件的 tenant。使用正常登录凭证，由操作者在自己的终端设置；不在文档、命令参数或代码中存放密码。

```sh
corepack pnpm plugin:deploy:local --plugin-dir /absolute/path/to/aftersales-ticket --scope tenant --api-url http://localhost:3002 --no-keychain
```

检查部署输出、descriptor 和 runtime revision。若 `restartRequired: true` / `pending_restart`，部署成功尚不代表服务已加载新版；重启测试 API 后核查 readiness、插件加载及模板/视图发现。仅访问 readiness 不能证明特定插件版本正确。

## plugins.json 不是已证实的必改步骤

此前操作者手工向 `plugins/global/plugins.json` 加入本插件。该修改仍是本机偏差，没有纳入插件仓库，也没有在本轮移除它或宣称无此修改的冷启动已通过。

测试宿主 c856a31c 源码证据：
- `packages/server/src/plugin/plugin-management.service.ts`：安装提交调用 pluginInstanceService.upsert，保存 source/sourceConfig/scope 等，再发布运行时变更。
- `packages/server/src/plugin/plugin-instance.loader.ts`：loadPluginInstances 读取 plugin_instance，buildOrganizationPluginConfigs 构建恢复配置。
- `packages/server/src/plugin/plugin.helper.ts`：restore 使用持久化的 immutable runtime 产物。
- `organization-plugin.store.ts`：另有 manifest 写入机制，不能把所有安装路径都等同于 npm manifest 安装。

本机 2026-11-28 部署回执曾为 generation 5，且明确 pending_restart；本轮用户重新部署回执为 generation 6，同样要求重启。因此“部署只复制文件、不登记、必须手改 manifest”尚无充分证据。若复现失败，先核查部署回执、实际重启、安装记录恢复与产物路径；不要无条件改全局清单或直接写安装表。

## 测试账号

此前操作者直接写库创建用户及 user_organization，仅能说明该账号登录和主流程可用，不能证明正常用户创建流程完整。宿主存在 `POST /api/user`，受 TenantPermissionGuard/PermissionGuard 保护，走 UserCreateCommand（规范化账号、检查重复、哈希密码后创建）。优先使用管理界面或此正常接口，不复制历史 SQL；组织关系使用平台正常管理流程。

本轮未重置数据库、未新增账号、未修改身份权限，未将历史报告的明文测试密码带入仓库。已有泄露的测试密码应由操作者更换。