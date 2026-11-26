export type InboxLanguage = 'zh' | 'en'

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

export function inboxIntent(input: string, preferredLanguage: string): InboxLanguage | null {
  if (input.length > 240) return null
  const text = input.normalize('NFKC').trim().toLowerCase().replace(/\bwhat['’]s\b/g, 'what is')
  const command = /^\/inbox(?: (en|zh))?$/.exec(text)
  if (command) {
    if (command[1] === 'en' || command[1] === 'zh') return command[1]
    if (/^zh/i.test(preferredLanguage)) return 'zh'
    return /^en/i.test(preferredLanguage) ? 'en' : null
  }
  if (/["'“”‘’`<>{}\[\]\/\\\r\n]/u.test(text)) return null

  const chinese = text.replace(/[\s、，,。.!！?？;；]/gu, '')
    .replace(/^(?:你好|麻烦你?|请问|请你?|请|可以|能不能|能否|能|帮我|给我|我想要?){0,4}/u, '')
    .replace(/(?:吗|呢|谢谢)$/u, '')
  const zh = matchListing(chinese, zhRequests, zhOutputDirections, 'zh')
  if (zh) return zh

  const english = text.replace(/[,!.?;]/gu, ' ').replace(/\s+/gu, ' ').trim()
    .replace(/^(?:(?:hi|hello|please|could you|can you|would you|please help me) ){0,3}/u, '')
    .replace(/ (?:please|thanks|thank you)$/u, '')
  // After "sent" or "submitted", a bare "in English" could describe the source feedback.
  const directions = /\b(?:sent|submitted)\b/u.test(english) ? enOutputDirections : enShortDirections
  return matchListing(english, enRequests, directions, 'en')
}
