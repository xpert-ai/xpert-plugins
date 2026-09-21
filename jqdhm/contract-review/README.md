# Contract Review · 合同资料整理助手

一个运行于 Xpert 的合同资料整理 Agentic App。Xpert 的模型把合同正文整理成候选字段，Java 服务检查字段与原文依据并持久化；工作人员在工作台查看、修订、确认，最后复制摘要。

**主要业务由 Java 实现。** TypeScript 包是连接 Xpert 的 SDK 入口、工具和视图适配层。独立插件交付并不等于 JVM 可以直接加载到 Node 宿主，因此安装时需要同时运行 Java 服务。

## 能做什么

- 提取甲方、乙方、金额、生效日期、到期日期、付款方式；每项候选携带原文依据。
- 缺失项保留为空。Java 校验字段值在依据中、依据在原文中，拒绝不匹配结果。
- 工作台编辑与确认；已确认记录只读。版本号防止并发编辑互相覆盖。
- 创建请求幂等、确认重试幂等、操作记录与业务修改同事务提交。
- 按 Xpert 提供的租户、组织、用户、助手隔离数据。Agent 没有修改或确认工具。
- Java 生成基于已存字段的摘要，标明待核对/已人工确认。

这些检查验证的是引用一致性，不证明条款真实、合法或具有法律效力；仍需人工阅读原文。首版只接受纯文本，不包含 PDF/OCR、签章、审批引擎或外部通知。

## 结构与运行要求

```text
java-service/       Java 21 + Spring Boot 3，REST/JDBC/H2
src/lib/            Xpert 工具、视图、身份上下文、HTTP 适配
src/remote/         人工核对工作台
assistant.yaml      助手工作流模板
examples/           虚构合同与候选 fixture
scripts/            打包、本地演示和验证工具
docs/               设计、实施计划及验证记录
```

需要 JDK 21+、Maven 3.9+、Node.js 22 和 npm。插件使用 Xpert SDK/contracts 3.18.4；本地演示无需 Docker、Xpert 账号或模型额度。H2 文件库存于 `java-service/data/`，仅供本地演示；没有把它当作生产多实例数据库。

## 先跑本地演示

在本目录执行：

```sh
npm ci
npm run build
mvn -f java-service/pom.xml package
npm run demo
```

打开 `http://127.0.0.1:4397`，点击顶部“载入测试草稿（不调用 AI）”，选择合同，查看原文和字段，修改后保存，再确认并生成摘要。

`npm run demo` 启动真实 Java 服务和本地 bridge 预览服务器，并生成仅用于本次进程的随机通信 token，不输出 token。两个服务仅绑定本机回环地址；Ctrl+C 停止。Java 数据重启后保留。若端口被占用，可设置 `CONTRACT_SERVICE_PORT` / `PREVIEW_PORT`。若 Maven 提示不支持 release 21，检查 `mvn -v` 的 Java 路径并将当前终端 `JAVA_HOME` 指向 JDK 21+。

**演示页明确标注：这不是实际 Xpert 部署，也没有运行大模型。** 固定 fixture 只替代“模型产生候选”一步；后续走真实插件视图适配器和 Java 业务接口。在此页点击“交给助手提取”会说明尚未连接 Xpert，不会伪造模型回复。

## 安装到 Xpert

1. 构建并运行 Java 服务。设置高熵 `CONTRACT_SERVICE_TOKEN`；真实部署使用持久化数据库并将服务放在可信网络内。跨机器使用 HTTPS，不向公网直接开放业务端口。
2. 在本目录执行 `npm run build` 和 `npm pack`。安装生成的 npm 包或依照宿主支持的本地插件安装方式安装本目录。
3. 在插件服务端配置中填 `serviceUrl`、`serviceToken` 和 `timeoutMs`。插件与 Java 必须使用同一 token。此 token 不是用户登录 token，也不能放在前端或提交到 Git。
4. 在 Xpert 创建本插件 App 或导入 `contract-review-assistant` 模板，为助手绑定可用的支持工具调用的模型。
5. 打开合同工作台，录入正文并“交给助手提取”；确认 Agent 实际调用 `contract_review_create`，成功后刷新并人工核对。

若宿主在容器里，`127.0.0.1` 指向宿主容器自身，应配置容器可访问的 Java 地址（例如 Windows Docker Desktop 的 `host.docker.internal`）。宿主安装具体命令以对应 Xpert 版本为准。当前仓库只提供插件，不包含完整 Xpert 平台。

上游根 `AGENTS.md` 要求真实平台安装配置使用 `community/.env` 的 `XPERT_API_URL`、`XPERT_TOKEN`、组织范围信息等。不要通过数据库挖取身份，也不要自行签发平台 token。该文件不应提交。本交付在无平台环境情况下完成本地验证，平台安装和真实模型闭环另行验证。

## Java HTTP API

所有 `/api/contracts` 请求都要求 `Authorization: Bearer <service token>` 及四个身份头：`X-Tenant-Id`、`X-Organization-Id`、`X-User-Id`、`X-Assistant-Id`。身份由服务端插件从宿主取出，模型入参不允许携带身份。健康检查 `/health` 不返回业务配置。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/contracts` | 创建候选草稿；相同 requestKey 同负载重试返回原记录 |
| GET | `/api/contracts` | 访问范围内最近 50 条摘要 |
| GET | `/api/contracts/{id}` | 正文、字段、版本和操作记录 |
| PUT | `/api/contracts/{id}` | 人工修改字段，要求 expectedVersion |
| POST | `/api/contracts/{id}/confirm` | 人工确认，要求 expectedVersion |
| GET | `/api/contracts/{id}/summary` | 有状态标识的文字摘要 |

数据格式及错误码见 [设计说明](docs/design.md)。`examples/draft.json` 只含虚构数据，可用于接口联调。AI 提取的 sourceText 仍需用户对照自己提交的正文核对，不能把“能引用原文”误解成“模型输入来源已经被证明可信”。

## 测试与交付

```sh
mvn -f java-service/pom.xml test
npm run typecheck
npm test
npm run test:ui
npm run build
npm pack --dry-run
```

还需从仓库根目录按 `plugin-dev-harness/README.md` 安装构建 harness，然后执行：

```sh
node plugin-dev-harness/dist/index.js --workspace ./jqdhm/contract-review --plugin @jqdhm/xpert-contract-review
```

Harness 只验证加载和生命周期，不代替实际 Xpert 页面或模型验收。具体执行结果见 [验证记录](docs/validation.md)。面试演示时建议按“录入 → 提取候选 → 查原文 → 修订 → 人工确认 → 摘要”讲清流程，再展示版本冲突和跨作用域访问测试。

## AI 辅助开发记录

本功能使用 Codex 辅助仓库阅读、方案设计、Java/TypeScript 代码编写、测试与问题修复。设计、接口契约和限制保留在 `docs/` 中；Git 提交、测试结果和 PR 便于复核。没有把本地 fixture 当作真实模型调用结果。

许可证沿用仓库 AGPL-3.0；本次任务只提交 PR，不合并、不发布 npm。
