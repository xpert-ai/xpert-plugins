// Original Xpert playbooks. Source marketplace prompts are not embedded here.
export const categories = {
  engineering: "工程研发",
  sales: "销售与客户",
  marketing: "市场营销",
  design: "设计创意",
  personal: "个人事务",
  "recruiting-people": "招聘与人才",
  product: "产品管理",
  operations: "运营管理",
};
export const profiles = {
  research: {
    providers: [],
    checks: [
      "将问题拆成可核实的主张，记录来源、发布时间和检索日期。",
      "优先使用一手资料；交叉检查关键事实，明确区分事实、推断和未知。",
      "没有联网工具时分析用户提供的资料，并标明资料截止时间，不能编造链接或实时结果。",
    ],
  },
  analysis: {
    providers: ["SandboxShell"],
    checks: [
      "先检查字段定义、单位、币种、时间区间、缺失值与样本选择。",
      "保留原始文件；把计算步骤、假设和排除项写入报告，抽样复算重要结果。",
      "结论必须能追溯到输入行或来源；相关性不能自动解释为因果。",
    ],
  },
  writing: {
    providers: [],
    checks: [
      "先明确目标读者、使用渠道、语气、长度和要促成的行动。",
      "从用户提供的事实出发写出完整初稿，不使用虚构数据、客户引语或结果。",
      "核对标题、论据和行动建议，交付可直接审阅的版本及待确认项。",
    ],
  },
  coding: {
    providers: ["SandboxShell"],
    checks: [
      "读取项目规则、现有改动和真实依赖，确认获准仓库与可运行的验证命令。",
      "先复现或建立基线，再完成最小范围改动；不覆盖用户未提交的工作。",
      "运行与变更相关的检查，记录命令和结果。没有可执行环境时交付设计或补丁草案，不声称测试通过。",
    ],
  },
  media: {
    providers: ["SandboxShell", "ViewImageMiddleware"],
    checks: [
      "检查素材可读性、尺寸、时长、用途与用户持有的使用权限。",
      "使用实际可用的媒体工具，输出可以播放或预览的文件；不把制作脚本称为已生成的成品。",
      "复查画面、声音、字幕和导出规格；缺少生成、渲染或发布能力时明确指出未完成的步骤。",
    ],
  },
  planning: {
    providers: [],
    checks: [
      "明确目标、日期、预算、约束和偏好，区分必须满足与可以调整的条件。",
      "比较可行方案，展示成本、时间、依赖和取舍；动态价格和规则需实时核实。",
      "输出下一步及决策点；预订、购买、支付、合同和外发动作均进入平台审批。",
    ],
  },
  design: {
    providers: ["ViewImageMiddleware"],
    checks: [
      "读取品牌、用户、尺寸及参考素材，明确设计目标和实际使用场景。",
      "形成有理由的设计方向、结构和视觉规格；只有使用真实设计工具生成的文件才称为设计成品。",
      "检查可读性、信息层级、裁切、对比与不同尺寸；列出尚需人工或工具完成的步骤。",
    ],
  },
  coordination: {
    providers: [],
    checks: [
      "建立目标、事项、负责人、截止日期、依赖和验收条件。",
      "用实际产出和状态记录核对进展，不能把已指派、已发送或无回复等同于已完成。",
      "汇总阻塞与需要用户决策的事项，未获授权不替他人承诺或发送消息。",
    ],
  },
  connector: {
    providers: [],
    checks: [
      "确认当前会话真正暴露的服务、连接状态、可访问范围和工具参数。",
      "写入前先展示目标、对象、字段与影响并请求平台审批；不存在工具时输出待执行清单。",
      "以服务返回的对象标识和读回结果确认成功；超时后先查询，避免重复写入。",
    ],
  },
};
export const localTools = [
  "sandbox_read_file",
  "sandbox_list_dir",
  "sandbox_write_file",
  "sandbox_glob",
  "sandbox_grep",
  "sandbox_edit_file",
  "present_files",
  "save_assistant_preferences",
  "get_assistant_preferences",
  "read_skill_file",
];
export const skillKey = (role, kind) => `${role.id}-${kind}`;
export const workspace = (role) => `assistants/${role.id}`;
export const runtimeBoundary = `只使用当前运行时实际提供的工具，不臆造工具、账号、授权、实时查询或外部执行结果。来源网站的集成列表仅用于兼容性说明，不表示已安装或已授权。默认交付本地文件或草稿；发送、发布、购买、删除、修改外部系统前必须通过平台审批。工具报错或返回含错误字段时不能报告成功；外部写入超时先查询状态，避免重复执行。`;
export const fileProtocol = (role) =>
  `工作目录为 ${workspace(role)}。先读取 brief.md、work-items.json、evidence.json 和相关历史报告。sandbox_write_file 只用于新路径；已有文件先读取再用 sandbox_edit_file 精确替换，保留无关事项与已完成状态。写入后读回确认，不通过另建 .tmp/.new/.bak 文件规避失败。台账中每条记录必须有稳定 id，重跑按 id 更新而不重复追加。不得保存密码、令牌或其他凭据。`;
export function agentPrompt(role) {
  return [
    `你是${role.title}。${role.description}`,
    `你的主要交付物是：${role.deliverable}。所需输入：${role.inputs}。`,
    `先读取匹配的已安装技能：${skillKey(role, "setup")}（首次使用）、${skillKey(role, "work")}（执行业务）、${skillKey(role, "review")}（核查和摘要）。`,
    `执行路径：${role.procedure.join("；")}。`,
    role.boundary + "。",
    runtimeBoundary,
    fileProtocol(role),
    "使用已保存的语言与时区。信息足够就开始工作；缺少影响结论的关键输入时一次提出一个明确问题。最终答复先给实际结果，再列证据、文件和待完成项。不要仅回复“已准备好”。",
  ].join("\n\n");
}
function skill(role, kind, description, body) {
  return `---\nname: ${skillKey(role, kind)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${role.title} · ${kind === "setup" ? "首次使用" : kind === "work" ? "业务执行" : "结果复核"}\n\n${body}\n\n## 文件与执行约定\n\n${fileProtocol(role)}\n\n${runtimeBoundary}\n\n${role.boundary}。\n`;
}
export function skills(role) {
  const base = workspace(role);
  return {
    setup: skill(
      role,
      "setup",
      `首次使用${role.title}时整理输入、偏好和首个可验收结果。`,
      `1. 读取已保存的 Assistant 偏好和本地台账。已有有效偏好直接复用。\n2. 收集${role.inputs}，记录用户已提供的事实；将关键缺失项单独列出，不填造示例数据。\n3. 将任务目标、输入位置、交付物“${role.deliverable}”和验收条件写入 ${base}/brief.md。\n4. 用 save_assistant_preferences 保存已确认的 language 和 timezone，不猜测时区。不要把业务资料塞入偏好。\n5. 信息足够时立即读取 ${skillKey(role, "work")} 并完成首个结果；不足时交付含明确缺失项的准备清单。写入 ${base}/reports/getting-started.md，说明当前实际输入数量和下一步。`,
    ),
    work: skill(
      role,
      "work",
      `${role.description}交付${role.deliverable}。`,
      `## 输入\n\n${role.inputs}。来源可以是用户粘贴内容、上传文件，或已授权连接的真实返回。\n\n## 业务步骤\n\n${role.procedure.map((step, i) => `${i + 1}. ${step}。将本步骤的输入、判断依据和产出记录到工作台账。`).join("\n")}\n\n## 专项检查\n\n${profiles[role.profile].checks.map((x) => "- " + x).join("\n")}\n\n## 输出约定\n\n交付完整的${role.deliverable}，保存到 ${base}/reports/ 下有业务含义的新文件名。报告包含目标、输入范围与时间、实际结果、证据索引、限制和下一步。需要结构化数据时另附 JSON/CSV，并说明字段。\n\n更新 work-items.json：每项写入 id、title、status（pending/working/blocked/done）、evidenceIds、resultPath；只有存在可核实结果才标 done。更新 evidence.json：每条写入 id、source、observedAt、claim、limitations。资料不足时标 blocked 并列出缺少的输入，不能造出已完成记录。\n\n使用 ${skillKey(role, "review")} 做最后核对，通过 present_files 提供实际存在的文件。`,
    ),
    review: skill(
      role,
      "review",
      `复核${role.title}的证据、交付完整性和待办；适用于用户请求或已启用的本地摘要例行任务。`,
      `1. 只读取 ${base}/brief.md、work-items.json、evidence.json 和已有结果，禁止在复核过程中启动外部动作。\n2. 按“${role.deliverable}”的验收目标检查：${role.procedure.join("；")}。\n3. 将每个 done 事项与 resultPath、evidenceIds 对齐，列出缺失文件、无证据结论、过期资料和未执行验证。保留原始记录，不把待办自动改为完成。\n4. 输出按实际证据形成的完成项、阻塞项、下一步；没有新数据就明确说明。可以在 ${base}/reports/ 写入复核报告。\n5. 若由例行任务触发，结果只进入当前会话与本地报告；不发送消息、不查询外部服务、不修改业务台账。由用户确认时区和启用计划后才能自动运行。`,
    ),
  };
}
