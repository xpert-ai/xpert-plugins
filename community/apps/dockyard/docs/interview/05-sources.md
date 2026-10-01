# 来源、许可、基线与 Git 交付

## 起始公开基线

本次整理依据 2026-09-14 重新读取的桌面更新版面试说明，SHA-256 为 `9f7e181aedb8194844e3be5fd5536d616ac80b5bcde871a13e9709a3dcc19921`。本项目早期留存附件副本的 SHA-256 为 `eb13dfa1e77dc094e3602f0085c452539345d37d82ade9f45ad7f5d39f612100`，两者不同；保留历史基线，不将早期副本标为本次读取版本。原件与副本均未修改。

| 来源 | SHA | 用途 |
| --- | --- | --- |
| xpert-ai/xpert main | `01aa0f76eb96ef88e8a435d7d99832c7b7138560` | 本任务专用开源宿主 |
| xpert-ai/xpert-plugins main | `f34e193e5d5936915b9a24d79b98f85227583ac5` | Fork 和插件起始代码 |
| wieslawsoltes/Dockyard | `116dcd672cd6123de8ba798e1647e7ecf994a37c` | 原工作台、样例与测试 |
| xpert-ai/xpert-skills | `652685488f405917f20ffaed553a6c797e2d6bec` | 项目内安装的三个公开 Skills |

本次整理未拉新版本。实际运行不是“干净 main”：包含聊天引用接口及后续挂载检查本地改动。宿主 PR 提交为 `16c141536c7444d876c8af60eccecaff05ae24a8`，基于 develop，不能冒称 main 已包含该能力。插件版本 0.3.0，本次提交分支为 `update/dockyard-workbench`，基于与起始 SHA 相同的最新 upstream/main；最终源码以本 PR 的提交为准。

## 复用和自有改动

Dockyard 源码采用 MIT，保留原 LICENSE、NOTICE 和 vendor/provenance.json，原 vendor 文件字节不变。复用布局库、示例工作台、主题、模型及上游测试。自有改动是构建时样例适配、Xpert 插件注册与模板、数据库保存和范围隔离、右键引用桥接、测试和运行材料。插件 package 声明 AGPL-3.0；保留 [第三方声明](../../THIRD_PARTY_NOTICES.md)，不把上游代码写成自有实现。

公开参考：[Dockyard](https://github.com/wieslawsoltes/Dockyard)、[插件仓库](https://github.com/xpert-ai/xpert-plugins)、[Xpert Skills](https://github.com/xpert-ai/xpert-skills)。面试附件未修改，也不作为公共插件附件上传。

## 两种 PR 必须区分

| 项目 | 当前状态 | 是否是题目最终交付 |
| --- | --- | --- |
| Fork：yurongk/xpert-plugins | 已配置 origin 与官方 upstream，本地提交分支 update/dockyard-workbench | 只是准备条件 |
| 插件功能分支 → xpert-ai/xpert-plugins main | 本分支用于提交草稿 PR | **这是插件交付入口，界面验收仍待补齐** |
| [xpert-ai/xpert #1025](https://github.com/xpert-ai/xpert/pull/1025) → develop | 已创建宿主通用引用接口 PR；本次未查询远端最新状态 | 平台补充，不替代插件 PR |

按题目要求在正式插件提交前核对差异、排除临时文件/凭证/非必要产物，附最终源码 SHA、实际测试版本及真实截图。用户随后明确要求插件 PR，并将六份材料随源码提交；本次仅发布插件草稿 PR，不更改宿主 PR、不合并。
