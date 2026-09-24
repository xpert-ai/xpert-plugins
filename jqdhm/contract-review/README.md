# Contract Review · 合同资料整理助手

为需要登记合同台账的运营、销售支持人员提供一个核对工作台：先保存合同原文，由模型提取双方名称、金额、日期和付款方式，工作人员对照依据修改并确认，最后复制结构化摘要。

主要业务由 **Java 21 + Spring Boot** 实现。TypeScript 负责 Xpert SDK、工具和工作台适配。插件需要连接单独运行的 Java 服务；安装 npm 包不会自动启动 JVM。

当前 Java、适配层、页面测试、本地真实 Ollama 浏览器流程，以及 **真实 Xpert 平台内的完整业务流程** 均已通过。平台验收实际经过工作台、Agent 工具、Java 服务和 Ollama，详情见 [验证记录](docs/validation.md)。

## 用户、问题和取舍

原来的做法是逐份阅读合同，再把名称、金额和日期抄到台账中，后续核对还要回原文寻找出处。这个应用把“抄字段”和“查依据”放在同一页，AI 只生成候选，最终由人确认。

本次保留一条完整流程：录入纯文本 → 保存原文 → AI 提取 → 查看原文和依据 → 人工修订 → 确认 → 摘要。每一步都能重新读取保存结果；模型失败后原文仍在，可以刷新后重试。

首版不做 PDF/OCR、电子签章、复杂审批流、法律风险判断和外部通知。字段依据检查只确认引用来自原文、值与依据匹配，不证明合同真实、合法或有效。

工作台结构：

```text
标题、合同正文、提取按钮及当前进度
历史记录列表 | 原文 | 六个字段及各自原文依据
缺失项/失败提示、保存修订、人工确认、摘要
```

AI 没有修改和确认工具；保存修订、确认只能从人工工作台发起。原文保存后，模型只接收记录 ID，通过工具读原文并提交候选，不能用自编原文替换用户输入。

## 代码结构

```text
java-service/   Spring Boot REST、字段规则、事务、H2 持久化
src/lib/       Xpert 工具、身份上下文、HTTP 客户端、视图和模板
src/remote/    合同资料核对页面
assistant.yaml Xpert 助手模板
examples/      虚构合同与非 AI 测试草稿
scripts/       构建、本地演示、接口及浏览器验证
docs/          设计、验证记录和实施状态
```

## 本地启动

需要 Node.js 22、JDK 21+、Maven 3.9+ 和运行中的 Ollama。SDK/contracts 固定为 `3.18.4`。本地演示不需要 Xpert 账号；真实平台验收需要 Xpert 环境。

在本目录执行：

```sh
ollama list
npm ci
npm run build
mvn -f java-service/pom.xml package
npm run demo
```

确认本机已有 `qwen2.5:7b`；没有时先运行 `ollama pull qwen2.5:7b`，或将 `OLLAMA_MODEL` 设置为已安装且能按要求返回 JSON 的模型。打开 <http://127.0.0.1:4397/>，填写标题和正文，或使用页面提供的虚构示例，再开始提取。

`npm run demo` 启动本地 Java 服务（默认 `8097`）与预览页面（默认 `4397`），自动生成本次服务令牌并经服务端桥接使用，不向页面暴露令牌。H2 数据保存在 `java-service/data/`，关闭后再次启动仍可读取。该数据库用于本地单实例演示。

本地提取最多接收 6,000 字符，同一时间只执行一个模型请求。首次加载模型可能较慢；失败会显示原因并保留待提取草稿，不用固定答案替代模型结果。“载入测试草稿”只是页面演示入口，明确不调用 AI。

可选环境变量（PowerShell 示例，均为非敏感值）：

```powershell
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = 'qwen2.5:7b'
$env:OLLAMA_TIMEOUT_SECONDS = '180'
$env:CONTRACT_SERVICE_PORT = '8097'
$env:PREVIEW_PORT = '4397'
npm run demo
```

如机器默认 Java 版本低于 21，可通过 `JAVA_CMD` 指定 Java 可执行文件，或先调整 `JAVA_HOME` 和 `PATH`。模型地址只在服务端配置，用户输入不能指定请求地址。

## 安装到 Xpert

### 1. 启动 Java 服务

构建完成后，为 `CONTRACT_SERVICE_TOKEN` 配置一个高熵随机值，并在 Xpert 插件配置中使用同一个值。令牌从本地环境或秘密管理系统提供，不写入代码。平台模式由 Xpert 模型提取，无须启用 `local-extraction` profile。

```powershell
# 先在当前进程安全设置 CONTRACT_SERVICE_TOKEN，再启动服务。
# 可选：CONTRACT_DB_URL / CONTRACT_DB_USER / CONTRACT_DB_PASSWORD。
Set-Location java-service
java -jar target/contract-review-service-0.1.0.jar
```

在容器内运行 Xpert、Java 在宿主机运行时，插件 `serviceUrl` 可配置为 `http://host.docker.internal:8097`。服务需绑定容器可访问的地址，且仅允许可信网络访问；跨机器使用 HTTPS。单独运行 jar 默认绑定 `0.0.0.0`，本地 `npm run demo` 会显式绑定 `127.0.0.1`，不能直接把预览模式的地址当作容器服务地址。

### 2. 打包并安装插件

回到本插件目录执行：

```sh
npm run build
npm pack --dry-run
npm pack
```

生成 `jqdhm-xpert-contract-review-0.1.0.tgz`。通过 Xpert 的插件归档安装入口上传；也可使用平台的 `POST /api/plugin/archive`。以下为 PowerShell 下的等效请求，需事先通过正常登录取得有安装权限的访问令牌和租户/组织标识：

```powershell
curl.exe --fail-with-body --request POST "$env:XPERT_API_URL/api/plugin/archive" `
  --header "Authorization: Bearer $env:XPERT_TOKEN" `
  --header "tenant-id: $env:XPERT_TENANT_ID" `
  --header "organization-id: $env:XPERT_ORG_ID" `
  --header "x-scope-level: organization" `
  --form "file=@jqdhm-xpert-contract-review-0.1.0.tgz" `
  --form "config=<plugin-config.local.json"
```

`XPERT_API_URL` 为不带 `/api` 的平台 API 根地址，例如 `http://127.0.0.1:3081`。`plugin-config.local.json` 是不提交的本地文件，结构如下；将占位符换成实际服务令牌：

```json
{
  "serviceUrl": "http://host.docker.internal:8097",
  "serviceToken": "<与 Java 服务一致的随机令牌>",
  "timeoutMs": 10000
}
```

仓库级安装环境按根 `AGENTS.md` 放在不提交的 `community/.env`，变量包括 `XPERT_API_URL`、`XPERT_TOKEN`、`XPERT_ORG_ID`、`XPERT_TENANT_ID`、`XPERT_SCOPE`。身份来自正常登录，不从数据库生成身份或自行签发平台令牌。

### 3. 创建应用并配置模型

在 Xpert 应用中选择合同资料整理助手，根据 `contract-review-assistant` 模板创建助手，配置平台可用且支持工具调用的模型，然后打开其工作台。安装加载成功、模板创建成功、页面可访问、模型实际完成业务是不同的检查点，都需要验证。平台版本和验收结果以 [验证记录](docs/validation.md) 为准。

插件每次业务请求都会读取当前宿主配置。后台修改 `serviceUrl` 或 `serviceToken` 后，后续请求使用新值，避免插件启动时缓存旧配置；相关行为有独立测试。

## 接口与一致性

所有 `/api/contracts` 请求需要 Bearer 服务令牌及四个身份头：`X-Tenant-Id`、`X-Organization-Id`、`X-User-Id`、`X-Assistant-Id`。身份由服务端插件从 Xpert 上下文取得，不接受模型传入的身份。`GET /health` 不需要令牌。

| 接口 | 用途 |
|---|---|
| `POST /api/contracts/intake` | 保存原文，返回可恢复的待提取草稿；相同范围内相同标题和原文复用记录 |
| `POST /api/contracts/{id}/candidates` | 模型提交候选字段；服务端对已保存原文校验，不允许重写原文 |
| `GET /api/contracts` / `GET /api/contracts/{id}` | 最近 50 条记录列表 / 读取原文、字段及审计 |
| `PUT /api/contracts/{id}` | 人工保存修订，携带 `expectedVersion` |
| `POST /api/contracts/{id}/confirm` | 人工确认；未提取或关键字段缺失时拒绝 |
| `GET /api/contracts/{id}/summary` | 生成可复制摘要，标明待核对或已确认 |
| `POST /api/contracts/extract` | 仅本地 `local-extraction` profile：先保存，再调用真实 Ollama |
| `POST /api/contracts` | 测试草稿/兼容接口；不提供给 Agent |

Agent 工具只有 `contract_review_get`、`contract_review_candidates`、`contract_review_list`、`contract_review_summary`。候选、人工修订和确认都受版本与状态约束，重复候选和迟到模型结果不会覆盖人工修改。详细 DTO、版本和错误语义见 [设计说明](docs/design.md)。

## 实际运行截图

### 真实 Xpert 平台

2026-09-22 在本地 Xpert `3.18.6` 中，用测试管理员及“合同助手本地验证”组织完成浏览器验收。平台实际调用 `contract_review_get`、`contract_review_candidates` 和 Ollama `qwen2.5:7b`，随后完成人工修改、确认、刷新读取和摘要。下列是本次真实平台截图。

录入虚构合同，由工作台先保存原文并交给助手处理。

![Xpert 平台：输入合同](docs/screenshots/xpert-01-input.png)

模型通过工具读取原文、提交候选字段，页面显示结果和依据。

![Xpert 平台：模型提取字段](docs/screenshots/xpert-02-model-result.png)

测试受控注入一次保存 HTTP 503，页面保留人工修改并阻止确认。这是异常处理测试，不是实际模型故障。

![Xpert 平台：保存失败时保留修改](docs/screenshots/xpert-03-save-failure.png)

再次保存后刷新、人工确认，再刷新并生成摘要，结果保持一致。

![Xpert 平台：确认后重新读取](docs/screenshots/xpert-04-confirmed.png)

浏览器验收使用测试管理员。用户原账号已激活，并已加入“合同助手本地验证”组织；登录后切换到该组织，即可打开[合同资料整理助手](http://127.0.0.1:3080/chat/x/contract-review-studio-06232ee5/c)。合同仍按租户、组织、用户和助手隔离，用户可以用自己的账号新建合同。截图不包含访问令牌或密码。

### 本地预览

以下三张是 **本地预览页面 + Java + Ollama** 的浏览器自动化截图，时间为 2026-09-22。它们不作为 Xpert 平台截图使用，平台验收单独记录。

模拟一次提取失败：浏览器拦截请求返回 HTTP 503，原文草稿仍在，确认按钮不可用。刷新后仍能找回原文。

![本地预览：提取失败后原文仍保留](docs/screenshots/preview-01-failure-original-retained.png)

重试时实际调用 `qwen2.5:7b`，展示模型提取字段与对应原文依据。

![本地预览：真实模型提取的字段和依据](docs/screenshots/preview-02-real-model-fields.png)

人工修改并保存、刷新读取、确认，再刷新后显示已确认状态和摘要。

![本地预览：人工确认后刷新读取](docs/screenshots/preview-03-confirmed-reloaded.png)

## 测试与复现

```sh
mvn -f java-service/pom.xml test
npm run typecheck
npm test
npm run test:ui
npm run build
npm pack --dry-run
```

最新通过结果：Java **39/39**、适配层 **11/11**、页面与 HTTP 桥接 **15/15**。适配层包含运行中配置更新用例；Java 错误提示修订后，相关 `LocalExtractionTest` **12/12** 再次通过，最新 Java jar 已打包。页面单元测试使用 JSDOM；真实浏览器另跑下列脚本。

启动 `npm run demo` 后，另开终端：

```sh
node scripts/verify-local.mjs
npx playwright install chromium
node scripts/browser-acceptance.mjs
```

浏览器测试会创建虚构合同，验证失败保留、刷新恢复、真实提取、人工保存和确认。产物在被忽略的 `test-results/browser-preview/`。可通过 `DEMO_URL` 调整本地页面地址，脚本只允许 localhost/127.0.0.1，避免误操作远端环境。

真实平台脚本 `scripts/browser-xpert.mjs` 已完整通过四项检查。重跑时，使用 `XPERT_ASSISTANT_URL` 指定本地助手页面、`XPERT_PROFILE_DIR` 指定已登录的测试浏览器配置目录，再运行 `node scripts/browser-xpert.mjs`。本地 Docker 已恢复健康且保留原有数据；结果和截图在 `test-results/browser-xpert/`，随代码提交的脱敏截图见上方。

npm 归档另做过干净生产依赖安装检查：在独立临时目录以 `npm install --omit=dev` 安装，CJS/ESM 双入口、助手模板及工作台 HTML 均可加载，运行依赖没有借用上级目录的 `node_modules`。该检查证明当次归档的安装与资源分发；最终修改后的打包和平台结果仍分别核对。

插件生命周期检查从仓库根目录执行：

```sh
pnpm -C plugin-dev-harness install
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js --workspace ./jqdhm/contract-review --plugin @jqdhm/xpert-contract-review
```

Harness 只检查插件加载和生命周期，不能代替真实 Xpert 页面、宿主权限和模型业务验证。精确测试环境、边界和当前平台状态见 [验证记录](docs/validation.md)。

## AI 协作、复用和交付

开发使用 Codex 辅助阅读仓库、设计接口、编写 Java/TypeScript、生成测试和定位问题。本地业务提取使用 Ollama `qwen2.5:7b`。这里记录实际过程，不补写不存在的 AI 对话：

- 根据任务书，把“只展示提取结果”调整为“先持久化原文，再调用 AI”，并增加模型失败后的刷新恢复测试。
- 测试发现页面预存原文与本地提取可能产生两条草稿，因此把提取请求键绑定到同一份原文记录，补充重复请求及不同原文冲突测试。
- 页面模拟测试和浏览器流程分别验证交互与真实模型链路；浏览器注入失败只用于检验兜底，不标成实际模型故障。

开发中的取舍是保留 Java 业务边界、让模型只提交候选、由人确认，控制为一个可复现的最小应用；没有扩展为合同法律审查或完整审批系统。

开源复用来源：

| 来源 | 使用范围 | 许可 |
|---|---|---|
| [xpert-ai/xpert-plugins](https://github.com/xpert-ai/xpert-plugins) | 插件仓库组织、SDK 扩展方式、开发 harness | 沿用仓库 `AGPL-3.0` |
| [xpert-ai/xpert](https://github.com/xpert-ai/xpert) | Agentic App 宿主、工作台与模板协议 | 平台源码许可见其仓库，本提交不复制或修改平台业务源码 |
| Spring Boot / H2 | Java HTTP、事务及本地数据存储 | Apache-2.0 / H2 上游双许可条款 |
| Ollama | 本机真实模型推理服务 | MIT；模型权重许可独立遵循模型发布方 |

本插件新增合同 DTO/规则/事务、接口适配、助手模板、工作台页面以及测试和运行说明。开发分支为 `feat/java-contract-review-app`，提交至 Fork，目标为 upstream `main`：[PR #687](https://github.com/xpert-ai/xpert-plugins/pull/687)。任务不要求合并 PR 或发布 npm；基线 SHA 与真实运行版本见验证记录。
