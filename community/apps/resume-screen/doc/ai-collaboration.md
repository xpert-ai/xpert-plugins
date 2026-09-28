# AI 协作说明 · 简历初筛工作台

> 依据：spec v2.4 §7.7（中间件与工具清单）/ §7.8（Assistant 模板）与源码
> `src/lib/resume-screen.middleware.ts`、`src/lib/resume-screen-parse-prompt.ts`、
> `src/lib/resume-screen-parse.processor.ts`、`src/xpert-resume-screen-assistant.yaml`。

## 1. AI 在工作流里的三个落点

AI 的产出全部收敛为「结构化字段 + 匹配评分 + 理由」，落在候选人行的三类字段上：

| 落点 | 产出 | 位置 |
| --- | --- | --- |
| **抽取** | 姓名 / 工作年限 / 最高学历 / 最近公司 / 技能关键词 / 三句以内画像摘要 | `name` `yearsOfExperience` `education` `currentCompany` `skills[]` `summary` |
| **评分** | 对照当前岗位 JD 的匹配分（0–100 整数） | `matchScore` |
| **理由** | 一段可核对的评分理由 + 命中 JD 的关键点 + 风险项与信息缺口 | `matchReason` `hitPoints[]` `riskPoints[]` |

两条调用链路，红线语义等价：

- **主链路（链路 B，服务端队列直调）**：上传解析落库即入队 `managed-queue`，worker 逐份组装「JD+单份简历文本」prompt（`buildParsePrompt`），经中间件运行时 token 直调 `deepseek` provider（`deepseek-v4-flash`，temperature 0.2）做结构化抽取，优先 `withStructuredOutput`，失败降级「纯文本 JSON 容错抽取」；结果归一（分数夹取整到 0–100）后 service 直调回填。**全程不经过宿主对话、没有用户确认步骤。**
- **对话旁路（可选）**：用户在助手对话里贴文本时，走 `ResumeScreenMiddleware` 三工具（见 §3），由模型自主调用回填。

## 2. Prompt 硬约束（两条链路同源）

写给模型的约束，单测直接断言 prompt 红线（`resume-screen-parse-prompt.ts` 文件头注释所述契约）：

- **一条简历恰好调用一次 save 工具**（旁路）：`resume_screen_save_candidates` 的工具描述原文——“Call exactly once per resume with the original sourceText. Never invent fields; put missing info in riskPoints.”；助手 yaml 的 system prompt 同样要求「Do not merge multiple resumes into one call and do not skip any resume」。
- **不虚构**：原文没有的姓名/年限/学历/公司/技能一律留空，并把缺口写进 `riskPoints`；不给无依据的高分，`matchScore` 必须逐条比对 JD 后给出、与 `matchReason` 一致。
- **只输出契约内 JSON**：单个对象、合法 JSON，不允许解释文字与 markdown 围栏（服务端有容错抽取兜底，但仍不猜半截 JSON）。
- **阈值不越权**：`scoreThreshold` 只作为界面提示色参考写入提示词，并显式声明「是否进入下一轮完全由评审人决定，阈值不得影响评分与输出」。
- **不承诺处置**：助手 yaml 明示“推进/待定/淘汰是工作台人工动作，用户要求设置状态时解释须人工操作”。默认中文回答。

## 3. 模型工具面（三工具）与刻意不暴露的动作

中间件只向模型暴露三个工具：

| 工具 | 类型 | 用途 |
| --- | --- | --- |
| `resume_screen_save_candidates` | 写 | 批量回填抽取+评分结果（幂等：`dedupeKey` 相同 upsert 同一条） |
| `resume_screen_list_candidates` | 读 | 按状态/分数/关键词精简查询候选人 |
| `resume_screen_get_candidate_detail` | 读 | 单个候选人详情（含抽取、评分理由、处置状态） |

**刻意不提供**：推进（accept）/ 待定（hold）/ 淘汰（reject）/ 撤回（reset）/ 编辑字段（update）。这些动作只存在于工作台人工侧 `executeViewAction`（action：`accept_candidate` / `hold_candidate` / `reject_candidate` / `reset_candidate` / `update_candidate`）。

**原因**：不可逆或裁量性动作不能进模型工具面——录用决策永远归人（spec §1「为什么这样切」：复用平台「AI 生成待审数据 → 人工在工作台拍板 → 落库可恢复」范式）。同理，链路 B 直调模型时也不给模型任何工具，产出仅回填待审字段。

## 4. 人工修正不被覆盖（humanEditedFields）

三段机制闭环，保证「人改过的，AI 重跑也不许冲掉」：

1. **记录**：`update_candidate` 只接受可编辑白名单字段，命中的字段名累加进候选人行的 `humanEditedFields[]`（同时带 `expectedRevision` 乐观锁，冲突时前端给「查看最新 / 修改已暂存」恢复路径，不强制覆盖）。
2. **提示词层**：重新解析时若 `humanEditedFields` 非空，`buildParsePrompt` 注入「以下字段已被评审修正过……不要覆盖人工已修正字段，拿不准的保持留空」。
3. **落库层（权威）**：`saveCandidatesFromAgent` 回填前读取 `humanEditedFields`，对已修正字段直接跳过写入（AI patch 不含该字段），无论模型是否听话，人工值都不会被覆盖；回填后行状态统一流转 `pending_review`。

## 5. 失败时的行为边界

- 模型超时/异常/返回不可容错：队列 attempts（4 次含首次）末次尝试主动置 `failed` + 可读 `failureReason`；「重试」= 重新入队跑同一份原文，**不重复建记录**。
- 对话旁路兜底：agent 轮结束仍有滞留 `parsing` 行时 `markStaleParsingFailed` 收敛；服务端 sweep 每 5 分钟捞「parsing 超 10 分钟」行重投/标失败。
- 任何失败收敛都不影响人工已修正字段与幂等键。
