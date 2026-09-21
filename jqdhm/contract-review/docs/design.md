# 合同资料整理助手

## 目标与交付

在 Xpert 中安装独立 Agentic App，用户提交合同文本，由宿主配置的模型提取候选信息，经 Java 服务校验后在工作台核对、修订、确认并生成可复制摘要。主要业务由 Java 实现；TypeScript 仅承接 Xpert SDK、工具、配置和工作台协议。通过 GitHub CLI 管理 Fork 和 PR，目标为 upstream main，不合并、不发布 npm。

## 范围

- 首版接受合同纯文本，附有虚构样例；不宣称支持 PDF/OCR、电子签章、法律审查、Flowable 或生产部署。
- 字段固定为 partyA、partyB、amount、effectiveDate、expiryDate、paymentTerms。字段值为原文字符串，每个非空字段同时提交 evidence 原文摘录。缺失字段为 null，禁止猜测。
- Xpert 模式的模型运行于平台。无 Xpert 的本地演示通过 `local-extraction` 配置启用 Java → Ollama 的抽取入口；模型地址和模型名属于服务端配置。两种模式用明确的 capability 区分，不从提示词或显示文字猜测。固定 fixture 入口保留并单独标注。
- Java 21 / Spring Boot 3 / Maven / JDBC / H2 文件库，保留重启数据。H2 仅为本地演示存储。Node 22 / TypeScript / Xpert SDK 3.18.4 / ESM；单独包目录，不修改上游业务代码。

## API 合同

服务基址默认 http://127.0.0.1:8097，全部 /api/contracts 请求要求 Bearer CONTRACT_SERVICE_TOKEN。身份通过受信任插件设置的 X-Tenant-Id、X-Organization-Id、X-User-Id、X-Assistant-Id 四个头传入，不能为空。插件从 Xpert 执行上下文取值，模型、浏览器入参不得覆盖。四维组合为记录访问边界。

DTO：FieldValue={value:string,evidence:string}；Fields={partyA:FieldValue|null,partyB:FieldValue|null,amount:FieldValue|null,effectiveDate:FieldValue|null,expiryDate:FieldValue|null,paymentTerms:FieldValue|null}。每个 value/evidence 非空，evidence 必须为 sourceText 的连续子串，value 必须为 evidence 的子串；sourceText 不可在创建后修改。

- GET /health：公开返回 {status:"UP"}，不返回配置。
- POST /api/contracts：{requestKey,title,sourceText,fields}，创建 DRAFT，HTTP 201；相同作用域 requestKey 与相同负载返回原记录，HTTP 200；同键不同负载为 409。sourceText 上限 50000 字符，title 上限 120，requestKey 上限 128。
- POST /api/contracts/extract：仅 `local-extraction` 配置启用，接收 {requestKey,title,sourceText}，正文上限 6000 字符。Java 在数据库事务之外调用 Ollama，只接受六个候选字段，保留服务收到的原始正文；严格解析并复用原文依据校验、作用域和创建事务。成功后仅为 DRAFT，不自动确认。模型超时、无效输出、并发繁忙必须明确失败，不使用 fixture 兜底。
- GET /api/contracts：{items:Contract[]}，最多返回最新 50 条摘要（不返回 sourceText、fields；包含 id,title,status,version,updatedAt,warnings）。
- GET /api/contracts/{id}：完整 Contract。不存在或作用域不同统一 404。
- PUT /api/contracts/{id}：{expectedVersion,fields}，只修改 DRAFT；校验依据、CAS 版本、事务内更新并记录审计。冲突 409。
- POST /api/contracts/{id}/confirm：{expectedVersion}。只允许 DRAFT，partyA、partyB、amount 缺失或双方相同则 422；确认后 version+1。对 CONFIRMED、版本恰好为 expectedVersion+1 的重复确认返回原记录，不重复审计；其他冲突 409。
- GET /api/contracts/{id}/summary：{status,summary}；DRAFT 摘要明确待核对，CONFIRMED 摘要明确已人工确认，不表示合同审批通过或法律有效。

Contract={id,title,sourceText,fields,status:"DRAFT"|"CONFIRMED",version,warnings:string[],createdAt,updatedAt,audit:[{action:"CREATED"|"UPDATED"|"CONFIRMED",actorId,at}]}。错误={code,message}，不回传堆栈、SQL、token。非法参数 400，字段证据不匹配 422，作用域/凭证问题 401。请求正文限制和明确超时。

## 插件与界面

Plugin meta 提供 app、middleware、view、assistant-template，并附模板 DSL。Agent 工具仅包含 create/get/list/summary，不能确认或修改。服务调用基址和 token 为插件服务端配置，token 不进入 iframe、工具参数、日志或导出包。无凭证安装可以加载插件，但使用时明确提示配置缺失。

工作台通过平台 bridge 请求列表和详情、编辑六字段及依据、保存、确认、复制摘要；不让浏览器直连 Java。文本展示使用 textContent 或安全 DOM API。所有操作支持 pending、失败提示和刷新；确认遇到版本冲突保留输入并提示重新读取。原文展示、字段依据和缺失项清楚可见。

## 验证与限制

Java 集成测试覆盖正常流、证据错误、缺失必填、幂等冲突、重复确认、并发版本更新、作用域隔离、鉴权、持久化配置。插件完成类型检查、构建、adapter 测试、模板一致性检查、npm pack 内容检查，以及根 AGENTS 要求的 plugin-dev-harness 生命周期验证。

Xpert 模型与工作台的整体验收仍需实际 Xpert 环境和登录配置。本地 Ollama 调用可独立验证真实提取与 Java 保存，但不代替平台安装、平台工具调用和宿主权限验收。README 分别记录已验证和待验证项。
