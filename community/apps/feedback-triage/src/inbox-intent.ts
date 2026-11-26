export type InboxLanguage = 'zh' | 'en'
export type InboxIntent = { kind: 'list' | 'sourceLanguage'; language: InboxLanguage }

// This grammar consumes the entire request. Unrecognized words, filters, quantities and follow-up actions
// stay with the model so a partial match cannot replace a different task with a recent-ticket listing.
const zhNoun = '(?:(?:客服|客户)?反馈(?:工单|收件箱)?|工单|收件箱)'
const zhOwnerOrTime = '(?:我(?:这边)?(?:的)?|本人(?:的)?|最近(?:的)?|近期(?:的)?|最新(?:的)?|当前(?:的)?|提交的|提过的|发过的)'
const zhTarget = `${zhOwnerOrTime}{0,3}${zhNoun}(?:列表|清单)?`
const zhVerb = '(?:查看|查询|查一下|查下|浏览|看看|看一下|看下|看|列出来|列出|列一下|列下|显示|展示|打开)'
const zhField = '(?:工单编号|工单号|编号|问题|原文(?:摘录)?|状态)'
const zhFields = `${zhField}(?:[和及与]?${zhField}){0,4}`
const zhDetails = `(?:(?:并|也|再|同时)?(?:请)?(?:按|附上|带上|包括|包含|展示|列出|显示)${zhFields}(?:简要)?(?:列出|列一下|展示|显示)?(?:即可)?)?`
const zhRequests = [
  `(?:用(?:反馈)?收件箱工具)?${zhVerb}${zhTarget}${zhDetails}`,
  `(?:把|将)?${zhTarget}(?:按${zhFields})?${zhVerb}${zhDetails}`,
  `(?:在)?${zhTarget}(?:里|里面|中)?(?:都)?(?:有什么|有哪些|有些什么)${zhDetails}`,
  `${zhOwnerOrTime}{0,3}(?:都)?(?:有)?哪些${zhNoun}${zhDetails}`,
  `${zhOwnerOrTime}{1,3}${zhNoun}(?:列表|清单)`,
].map((pattern) => new RegExp(`^${pattern}$`, 'u'))
const zhLanguage = '(中文|汉语|英文|英语)'
const zhSource = `(?:(?:用|以)?${zhLanguage}(?:提交|填写|撰写|写成|写|发送|发过)的|(?:提交语言|原文(?:语言)?)(?:为|是)${zhLanguage}的)`
const zhSourceTarget = `${zhOwnerOrTime}{0,3}${zhSource}${zhNoun}(?:列表|清单)?`
const zhPrior = `(?:在|从)(?:刚才|上述|前面|这些)的?${zhNoun}(?:里|中|里面)`
const zhOnly = '(?:只看|仅看|只保留|筛选出?|筛出)'
const zhMatching = `(?:请?(?:列出|显示)符合条件的${zhNoun})?(?:如果没有(?:匹配的?|符合条件的?)?(?:就|请)?(?:说明原因|告诉我))?`
const zhSourceRequests = [
  `(?:${zhPrior})?(?:(?:只|仅)?${zhVerb}|${zhOnly})?${zhSourceTarget}${zhMatching}`,
  `${zhVerb}${zhTarget}${zhOnly}${zhSourceTarget}${zhMatching}`,
].map((pattern) => new RegExp(`^${pattern}$`, 'u'))
const zhOutputDirections = [
  new RegExp(`^(?:用|以)${zhLanguage}(?:(?:回答|答复|回复|输出)请?|(?=${zhVerb}))`, 'u'),
  new RegExp(`(?:并|同时)?(?:请)?(?:用|以)${zhLanguage}(?:回答|答复|回复|输出)$`, 'u'),
  new RegExp(`(?:用|以)${zhLanguage}(?=(?:列出|列一下|展示|显示)(?:即可)?$)`, 'u'),
]

const enOwnerOrTime = '(?:my|the|recent|recently|most recent|latest|current|newest|submitted)'
const enTarget = `(?:${enOwnerOrTime} ){0,4}(?:feedback tickets|support tickets|feedback inbox|feedback|tickets|inbox)(?: list)?(?: in my (?:feedback )?inbox| i (?:sent|submitted) (?:recently|lately))?`
const enVerb = '(?:show me|show|list|display|open|check|view|pull up|let me see|can i see|may i see|give me)'
const enField = '(?:ticket (?:numbers?|ids?)|ids?|numbers?|original (?:feedback|text)|excerpts?|issues?|statuses|status)'
const enDetails = `(?: (?:with|including|showing|and show|and include) (?:their )?${enField}(?: (?:and )?${enField}){0,4})?`
const enRequests = [
  `${enVerb} ${enTarget}${enDetails}`,
  `what (?:is in|are in|are) ${enTarget}${enDetails}`,
].map((pattern) => new RegExp(`^${pattern}$`, 'u'))
const enOutputDirections = [
  /^(?:(?:answer|reply|respond) )?(?:in|using) (english|chinese) (?:and )?/u,
  / (?:and |but )?(?:please )?(?:answer|reply|respond) (?:in|using) (english|chinese)$/u,
]
const enShortDirections = [...enOutputDirections, / (?:in|using) (english|chinese)$/u]
const enLanguage = '(?:english|chinese)'
const enNoun = '(?:feedback tickets|support tickets|feedback|tickets)'
const enSource = `(?:(?:that |which )?(?:(?:i|were|was) )?(?:originally )?(?:sent|submitted|written|filed) in ${enLanguage}(?: recently| lately)?|whose (?:source|original|submission) (?:language|text) is (?:in )?${enLanguage})`
const enSourceRequests = [
  `(?:only )?${enVerb} (?:only )?(?:${enOwnerOrTime} ){0,4}${enNoun} ${enSource}`,
  `(?:only )?${enVerb} (?:only )?(?:${enOwnerOrTime} ){0,4}${enLanguage}(?:-| )language ${enNoun}`,
].map((pattern) => new RegExp(`^${pattern}$`, 'u'))

function matchListing(text: string, requests: RegExp[], directions: RegExp[], language: InboxLanguage): InboxLanguage | null {
  if (requests.some((pattern) => pattern.test(text))) return language
  for (const direction of directions) {
    const match = direction.exec(text)
    if (!match?.[1]) continue
    const listing = text.slice(0, match.index) + text.slice(match.index + match[0].length)
    if (requests.some((pattern) => pattern.test(listing))) {
      return ['英文', '英语', 'english'].includes(match[1]) ? 'en' : 'zh'
    }
  }
  return null
}

export function inboxIntent(input: string, preferredLanguage: string): InboxIntent | null {
  if (input.length > 240) return null
  const text = input.normalize('NFKC').trim().toLowerCase().replace(/\bwhat['’]s\b/g, 'what is')
  const command = /^\/inbox(?: (en|zh))?$/.exec(text)
  if (command) {
    if (command[1] === 'en' || command[1] === 'zh') return { kind: 'list', language: command[1] }
    if (/^zh/i.test(preferredLanguage)) return { kind: 'list', language: 'zh' }
    return /^en/i.test(preferredLanguage) ? { kind: 'list', language: 'en' } : null
  }
  if (/["'“”‘’`<>{}\[\]\/\\\r\n]/u.test(text)) return null

  const chinese = text.replace(/[\s、，,。.!！?？;；]/gu, '')
    .replace(/^(?:你好|麻烦你?|请问|请你?|请|可以|能不能|能否|能|帮我|给我|我想要?){0,4}/u, '')
    .replace(/(?:吗|呢|谢谢)$/u, '')
  const zh = matchListing(chinese, zhRequests, zhOutputDirections, 'zh')
  if (zh) return { kind: 'list', language: zh }
  const zhSourceLanguage = matchListing(chinese, zhSourceRequests, zhOutputDirections, 'zh')
  if (zhSourceLanguage) return { kind: 'sourceLanguage', language: zhSourceLanguage }

  const english = text.replace(/[,!.?;]/gu, ' ').replace(/\s+/gu, ' ').trim()
    .replace(/^(?:(?:hi|hello|please|could you|can you|would you|please help me) ){0,3}/u, '')
    .replace(/ (?:please|thanks|thank you)$/u, '')
  // After "sent" or "submitted", a bare "in English" could describe the source feedback.
  const directions = /\b(?:sent|submitted)\b/u.test(english) ? enOutputDirections : enShortDirections
  const en = matchListing(english, enRequests, directions, 'en')
  if (en) return { kind: 'list', language: en }
  const enSourceLanguage = matchListing(english, enSourceRequests, enShortDirections, 'en')
  return enSourceLanguage ? { kind: 'sourceLanguage', language: enSourceLanguage } : null
}

const zhAction = '(?:分析|分诊|重试)'
const zhSubject = '(?:第[一二三四五六七八九十\\d]+(?:条|个|张)(?:反馈|工单)?|(?:这|那|该|最新|最近|最后|选中)(?:一)?(?:条|个|张)(?:反馈|工单)?|(?:这|那|该|最新的?|最近的?|选中的?|全部|我的)?(?:工单|反馈)|编号|它|#?[a-f\\d]{8})'
const zhLead = '(?:^|[，,。.;；]|然后|随后|接着|后|并)(?:请|帮我|麻烦|能否|可否|可以|能不能|继续|然后|再|只|仅|重新)*\\s*'
const zhDirectAnalysis = new RegExp(`${zhLead}${zhAction}(?:一下|一次)?(?=\\s*(?:${zhSubject}|[，,。.;；?!！？]|$))`, 'iu')
const zhAnalyzeSubject = new RegExp(`${zhLead}对${zhSubject}\\s*(?:进行|做|重新)?${zhAction}`, 'iu')
const enSubject = '(?:(?:the|my|this|that|these|those) )?(?:tickets?|feedback|it|(?:first|last|latest|selected) (?:one|ticket)|[a-f\\d]{8})'
const enLead = '(?:^|[,.;!?]|\\b(?:and|then)\\b)\\s*(?:(?:please|only|can you|could you|would you|i want you to)\\s+)*'
const enDirectAnalysis = new RegExp(`${enLead}(?:analy[sz]e|reanaly[sz]e|triage|retry)(?=\\s+${enSubject}\\b|\\s*(?:[.,;?!]|$))`, 'iu')

// Analysis can update a draft. A tool suggestion, quoted instruction or previous turn cannot authorize it.
export function requestsTicketAnalysis(text: string): boolean {
  const unquoted = text.replace(/“[^”]*”|‘[^’]*’|「[^」]*」|"[^"]*"|`[^`]*`|(?:^|\s)'[^']*'/gu, ' ')
  if (/(?:不要|不用|不必|无需|别|禁止)(?:再|先|继续|重新)?(?:分析|重试|分诊)|(?:分析|重试|分诊)(?:就|先|暂时|也)*(?:不用|不必|不要|免了)|\b(?:do not|don't|don’t|never|skip|without|no need to)\s+(?:analy[sz]|reanaly[sz]|triag|retr)/iu.test(unquoted)) return false
  return zhDirectAnalysis.test(unquoted) || zhAnalyzeSubject.test(unquoted) || enDirectAnalysis.test(unquoted)
}

/** A UUID identifies a ticket. A short number displayed by the workbench still needs scoped resolution. */
export function explicitTicketReferences(text: string): string[] {
  const source = text.normalize('NFKC').toLowerCase()
  const references: string[] = []
  const identifier = /(?<![a-z\d_-])[a-f\d]{8}(?:-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})?(?![a-z\d_-])/gu
  const label = /(?:#|工单(?:号|编号)?|反馈(?:编号)?|编号(?:为|是)?|分诊|重试|分析|\b(?:ticket(?: (?:id|number))?|id|retry|triage|analy[sz]e))\s*[:#`“"'「(]*\s*$/u
  for (const match of source.matchAll(identifier)) {
    const ref = match[0]
    // Eight decimal digits may be a date. Treat them as a short ticket ID only when explicitly labelled.
    if (ref.length === 36 || /[a-f]/u.test(ref) || label.test(source.slice(0, match.index))) references.push(ref)
  }
  return [...new Set(references)]
}
