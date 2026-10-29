# 验证记录

更新日期：2026-09-22。以下区分自动测试、本地真实模型流程和 Xpert 平台业务验收。

## 1. 版本和环境

| 项目 | 基线或实际版本 |
|---|---|
| 插件仓库 upstream | `https://github.com/xpert-ai/xpert-plugins.git` |
| 插件 main 基线 | `a2e1b54d6842524ecb9bd2b45066aa414e1518eb`，当前分支与 upstream/main 的 merge-base |
| Fork / 分支 | `jqdhm/xpert-plugins` / `feat/java-contract-review-app` |
| 本轮提交 | 见 [PR #687](https://github.com/xpert-ai/xpert-plugins/pull/687) 的提交记录及验收说明；本页记录本轮工作树验证结果 |
| 插件版本 / SDK | `0.1.0` / `@xpert-ai/plugin-sdk`、contracts `3.18.4` |
| Xpert 源码 main 基线 | `d24ca81b9f5885cf44dd77afdb0f91359b49c4ea`，来源 `https://github.com/xpert-ai/xpert.git` |
| 本地平台 API 镜像 | `ghcr.io/xpert-ai/xpert-api@sha256:314272b2a6b0184c5b0c66b7b4e7acac360df7d1dd9fc782aed8a624f098ebb6` |
| 本地平台 Web 镜像 | 配置 `ghcr.io/xpert-ai/xpert-webapp:latest`；实际镜像 ID 为 `sha256:700b54b9bac7638d69bbdd1dc242b2c8febf9253a70461378924c03d2abfbaf7` |
| 平台界面显示版本 | `3.18.6` |
| Java / Maven | 编译目标 release 21；本轮以 JDK 25、Maven 3.9.11 执行 |
| Node.js | 22.14 |
| 本地业务模型 | Ollama `qwen2.5:7b` |

Xpert 源码基线与实际部署镜像分开记录。本地平台使用发布镜像，未据此宣称已从上述 main SHA 构建并运行平台；如果验收要求严格运行 main，需要另行验证镜像对应源码或构建该 main。

## 2. 自动测试

| 检查 | 最新结果 | 覆盖范围 |
|---|---|---|
| Java Spring Boot 测试 | **39/39 PASS** | ContractApiTest 23、LocalExtractionTest 12、ApiSecurityFilterTest 2、PersistenceRestartTest 2 |
| Java 打包 | PASS | 错误文案修订后的最新 `java-service/target/contract-review-service-0.1.0.jar` 已生成 |
| TypeScript 适配层测试 | **11/11 PASS** | 工具与视图输入、宿主上下文、配置、调用及限制；新增运行中更新地址/令牌用例 |
| 页面与本地 HTTP 桥接 | **15/15 PASS** | JSDOM + HTTP；失败保留、刷新恢复、保存/确认、重复完成不再提取 |
| Java 提取模块定向复测 | **12/12 PASS** | 修正“未保存合同”旧提示后，`LocalExtractionTest` 在 JDK 25 下通过 |
| npm 归档干净生产安装 | PASS | 全新 E 盘目录 `npm install --omit=dev` 安装 186 个包；CJS/ESM、模板和 HTML 资源均可加载 |
| 真实 Xpert 平台浏览器验收 | **4/4 PASS** | 原文录入、Agent 实际工具提取、受控保存失败、重试/刷新/确认/摘要 |
| `git diff --check` | PASS | 未发现补丁空白错误 |

Java 测试覆盖原文先保存、证据不匹配、重复候选、人工修改后的迟到候选、确认幂等、旧版本冲突、作用域隔离、原文与提取请求绑定以及文件库重启读取。本地模型接口的异常测试使用受控响应；真实模型另见下一节。

新增配置更新修复：注册时注入读取 `context.config` 的函数，客户端每次请求再解析当前值；不再因服务地址或令牌被后台修改而持续使用旧快照。新增适配层测试通过。

生产安装检查使用 `npm pack` 归档，临时目录、npm 缓存和临时文件均放在 E 盘，未加入 Git。实际解析 `axios=1.20.0`、`short-unique-id=4.4.4`；两者是运行依赖。CJS 和 ESM 均读取到助手模板与 22,178 字节工作台 HTML，`require.cache` 中没有借用临时目录外的模块。该结果针对当次检查归档，不代表后续任意修改都已重新验收。

前次已完成类型检查、插件构建和 plugin-dev-harness 生命周期验证。真实平台业务验收另已完成，证据见第 4 节；最终提交和安装归档仍需与验收工作树保持一致。

## 3. 本地真实浏览器与模型

2026-09-22 18:08（北京时间），`scripts/browser-acceptance.mjs` 在本地预览、Java 和真实 Ollama 上完成一条浏览器流程。报告时间为 `2026-09-22T10:08:09.287Z`，结果 **PASS**。

依次完成：

1. 在浏览器中注入一次提取 HTTP 503，验证原文草稿保留且不能确认。
2. 刷新页面后找回同一份待提取原文。
3. 重试并真实调用 `qwen2.5:7b`，读取提取字段和依据。
4. 人工修改保存、刷新读取、人工确认、再次刷新并生成摘要。

第 1 步是测试注入故障，不是实际 Ollama 故障。后续成功提取确实调用模型，不是测试草稿或固定字段。

机器可读报告和浏览器 trace 原始产物位于不提交的 `test-results/browser-preview/`。供 GitHub 审阅的三张截图已随文档保留：

- [失败后保留原文](screenshots/preview-01-failure-original-retained.png)
- [真实模型候选字段](screenshots/preview-02-real-model-fields.png)
- [确认后刷新读取](screenshots/preview-03-confirmed-reloaded.png)

这组结果仅证明本地预览链路。它没有验证 Xpert 的登录、插件实际加载、工作台宿主桥接、平台模型配置和平台内完整业务流程。

## 4. Xpert 平台验收

`scripts/browser-xpert.mjs` 已在真实本地 Xpert 平台完整通过。报告为 `test-results/browser-xpert/report.json`，时间 `2026-09-22T11:28:54.451Z`（北京时间 19:28:54），合同标题 `Xpert浏览器验收（虚构）-3a6bddaf`，模型 `qwen2.5:7b`，结果 **PASS**。

完整链路是 Xpert 工作台 → Agent `contract_review_get` / `contract_review_candidates` → Java 原文及候选接口 → 页面人工修订与确认；模型实际运行在 Ollama，没有用 fixture 替代。四项检查如下：

| 报告检查项 | 已验证行为 |
|---|---|
| `intake-persists-original-and-dispatches-agent-command` | 页面保存原文后，把记录交给真实助手处理 |
| `real-platform-agent-populates-evidence-fields` | 平台 Agent 实际调用工具，字段及依据回到工作台 |
| `injected-save-failure-retains-edits-and-blocks-confirm` | 受控注入一次保存 HTTP 503，保留人工修改并禁用确认 |
| `save-retry-reload-human-confirm-reload-summary` | 保存重试、刷新读取、人工确认、再次刷新和摘要通过 |

第三项是浏览器测试注入故障，不是实际模型故障。对应截图已加入版本管理，README 使用相对路径引用：

- [平台输入](screenshots/xpert-01-input.png)
- [模型结果](screenshots/xpert-02-model-result.png)
- [保存失败后保留修改](screenshots/xpert-03-save-failure.png)
- [确认后重新读取](screenshots/xpert-04-confirmed.png)

浏览器验收使用测试管理员及“合同助手本地验证”组织。最终只读核对显示，用户原账号已完成邮箱验证，现为该组织的 active 成员；助手处于 active 状态，所在工作区按组织共享。用户登录后切换到该组织，可打开[合同资料整理助手](http://127.0.0.1:3080/chat/x/contract-review-studio-06232ee5/c)。这项核对不代表使用用户密码登录过；合同数据仍按租户、组织、用户和助手隔离。文档及截图不包含密码或访问令牌。

此前本地 Docker 的磁盘空间与残留 IPC 启动问题已恢复，相关容器健康，原有本地数据保留。最终平台界面和业务流程均已恢复并完成上述验收。此结果证明该本地测试环境的业务链路，不表示生产部署或源码 main 自编译验证已经完成。

## 5. 重跑方法

在插件目录：

```sh
mvn -f java-service/pom.xml test
npm run typecheck
npm test
npm run test:ui
npm run build
npm pack --dry-run
```

启动 `npm run demo` 后：

```sh
node scripts/verify-local.mjs
node scripts/browser-acceptance.mjs
```

浏览器脚本需要 Playwright Chromium，可先执行 `npx playwright install chromium`。测试使用虚构合同并保留测试记录。记录端口、模型和 profile 时不记录服务令牌或平台登录令牌。

重跑真实平台验收时，设置 `XPERT_ASSISTANT_URL` 为本地助手页面地址、`XPERT_PROFILE_DIR` 为已登录的测试浏览器配置目录，运行 `node scripts/browser-xpert.mjs`。它只允许本地地址，原始结果与截图保存在不提交的 `test-results/browser-xpert/`；本次已将四张脱敏截图选入 `docs/screenshots/`。

## 6. 仍未覆盖的范围

尚不能据当前记录宣称生产部署、生产级性能、法律审查准确率、PDF/OCR、跨用户协同权限或集群可用性；也没有据发布镜像的验证结果宣称从平台 main 自编译运行。本轮没有发布 npm、没有合并 upstream PR。最终代码提交及验收说明见 [PR #687](https://github.com/xpert-ai/xpert-plugins/pull/687)。
