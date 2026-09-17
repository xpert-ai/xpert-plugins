# 环境、安装与操作

## 版本与前提

平台采用开源 Xpert 的 main 起始基线，插件采用 xpert-plugins main 起始基线，具体 SHA 见 [来源](05-sources.md)。当前引用功能依赖额外的宿主改动 PR #1025，尚不能声称只安装插件就能在该未修改 main 基线上完整运行。

本任务使用 Node 22（此前为处理兼容性固定过 22.22.1）。以实际仓库配置为准：宿主 pnpm 10.24.0，Dockyard 独立包 pnpm 8.15.8，SDK/contracts 3.18.4。不要把插件与宿主的包管理器版本混用。

准备 PostgreSQL、Redis、测试组织、可用模型及有插件安装权限的账号。模型密钥通过平台配置，部署登录通过当前进程环境传入；不要提交真实凭证。环境变量示意见 [deploy.env.example](deploy.env.example)。这只是部署 CLI 登录示例，不替代宿主完整配置。

## 插件构建

以下命令在插件仓库根目录执行，首次需安装本独立包依赖：

```sh
corepack pnpm@8.15.8 --dir community/apps/dockyard install --ignore-workspace --frozen-lockfile
corepack pnpm@8.15.8 --dir community/apps/dockyard test
corepack pnpm@8.15.8 --dir community/apps/dockyard typecheck
```

`test` 包含 vendor 校验、构建、上游测试、插件测试与最终 HTML/模板一致性检查。只有测试通过后才能省略部署工具中的重复测试。

## 安装与六步核对

在测试宿主根目录按其现有 CLI 执行（替换路径及 API 地址）：

```sh
corepack pnpm@10.24.0 plugin:deploy:local --help
corepack pnpm@10.24.0 plugin:deploy:local \
  --plugin-dir <插件仓库>/community/apps/dockyard \
  --scope tenant --api-url <测试API地址> --no-keychain
```

| 顺序 | 操作 | 本任务证据/限制 |
| --- | --- | --- |
| 1 | 安装插件 | 0.3.0 官方部署回执已记录 |
| 2 | 重启测试宿主并验证加载 | 已在授权后重启专用 API，回读 HTML 与 dist 一致 |
| 3 | 展示助手模板 | 插件提供模板；最新版模板界面截图待补 |
| 4 | 基于模板创建助手 | 早期已创建；0.3.0 在原助手上更新模板，未重复创建 |
| 5 | 绑定工具与工作台 | 当前仅工作台能力中间件，原 AI 任务工具已移除；引用交给宿主 ChatKit |
| 6 | 真实模型、人工确认和保存 | 真实引用到模型通过；人工采用建议、保存、恢复的界面闭环待验收 |

首次从模板初始化；已有助手通过 Update from Template 流程更新并发布，保留模型、身份与会话。不要把“安装成功”当成“助手可用”。

## 用户操作

打开文件，选择文字或右键 Explorer 文本文件，选择“帮我改/解释一下”；在聊天框核对引用、填写要求并发送。修改建议需要用户手工采用。空选区保持原菜单；太长的全文提示缩小选择；引用失败可以待助手就绪后重试。

文件正文仍在数据库 buffers 记录中，未接工作区存储。文件树不代表本机源码目录。下载位置由浏览器决定，应用不指定绝对目录。整文件引用是文本快照，不是原生文件附件。
