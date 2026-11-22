import { RISK_CATEGORY_LABELS } from './constants'
import type { ConversationIssue, ConversationIssueSeverity } from './types'

/**
 * Identifies the exact `RULES` list below. Bump this string (`r1` -> `r2`, ...) any time a rule is
 * added, removed, or re-worded — never reuse a version after its rules changed. Stored on every
 * record at analysis time (`ConversationReviewRecord.ruleVersion`) so a salesperson comparing two
 * records, or a manager auditing history, can tell whether a difference in flagged risks reflects a
 * changed conversation or a changed rule set.
 */
export const RULE_VERSION = 'r1'

type RiskRuleCategory =
  | 'over_promise'
  | 'vague_commitment'
  | 'unconfirmed_delivery'
  | 'unauthorized_discount'
  | 'unverified_claim'

interface RiskRule {
  category: RiskRuleCategory
  severity: ConversationIssueSeverity
  pattern: RegExp
  /**
   * Literal phrases pulled straight from `pattern`'s own alternatives — shown to the salesperson via
   * `getRuleDisclosure()` in place of the regex itself, which reads as noise to a non-technical
   * reader. Kept on the same object as `pattern` on purpose: editing one without the other is a
   * one-line diff away from being noticed in review.
   */
  examples: string[]
}

/** Public shape of one rule, safe to send to the client: no `RegExp`, no internal-only fields. */
export interface RuleDisclosureEntry {
  category: RiskRuleCategory
  label: string
  severity: ConversationIssueSeverity
  examples: string[]
}

/**
 * Deterministic, model-independent risk-phrase detection.
 *
 * These exist to backstop the model's own judgement, not replace it: a handful of clearly risky
 * wordings should be flagged the same way no matter which model backs the assistant, because a
 * regex either matches or it does not. Everything more nuanced (is this concern price or trust,
 * how severe is this given the deal context) is still left to the model. Not every RISK_CATEGORY
 * has a rule here on purpose — `missing_followup` and `other` cannot be judged from wording alone.
 *
 * See conversation-review.middleware.ts for how the hits are both exposed as a callable tool and
 * merged in server-side regardless of whether the model calls it.
 */
const RULES: readonly RiskRule[] = [
  {
    category: 'over_promise',
    severity: 'high',
    pattern: /(绝对没问题|100\s*%\s*(没问题|可以|能做到)|一定能做到|包在我身上|肯定没问题|放心[，,]?一定)/g,
    examples: ['绝对没问题', '100% 可以', '一定能做到', '包在我身上']
  },
  {
    category: 'vague_commitment',
    severity: 'medium',
    pattern: /(尽快给你|应该快了|回头再说|晚点告诉你|大概率没问题|应该没问题吧)/g,
    examples: ['尽快给你', '应该快了', '回头再说', '大概率没问题']
  },
  {
    category: 'unconfirmed_delivery',
    severity: 'high',
    pattern: /(一定|保证|肯定)(按时|如期|准时)?(交付|上线|发货|到货|完成)/g,
    examples: ['一定按时交付', '保证如期上线', '肯定准时发货']
  },
  {
    category: 'unauthorized_discount',
    severity: 'high',
    pattern: /(骨折价|额外再打折|破例给你|我自己做主.{0,6}优惠|私下.{0,6}优惠)/g,
    examples: ['骨折价', '额外再打折', '我自己做主给你优惠']
  },
  {
    category: 'unverified_claim',
    severity: 'medium',
    pattern: /(行业第一|全网最低价|唯一能做到|市面上最好|绝对最好)/g,
    examples: ['行业第一', '全网最低价', '市面上最好']
  }
]

/**
 * Public catalog of the deterministic rules, safe to hand to the client: category, severity and a
 * few literal example phrases, no regex. Backs the "质检规则说明" disclosure panel and the rule
 * version modal — one function so both surfaces can never describe a different rule set than the
 * one `checkDeterministicRisks` actually runs.
 */
export function getRuleDisclosure(): RuleDisclosureEntry[] {
  return RULES.map((rule) => ({
    category: rule.category,
    label: RISK_CATEGORY_LABELS[rule.category] ?? rule.category,
    severity: rule.severity,
    examples: rule.examples
  }))
}

/**
 * Sentence containing the match, so `evidence` reads like something a salesperson can recognise
 * rather than a bare keyword. Falls back to the raw match when the text has no sentence
 * boundaries at all.
 */
function extractSentence(text: string, matchIndex: number, matchLength: number) {
  const boundary = /[。！？\n]/
  let start = matchIndex
  while (start > 0 && !boundary.test(text[start - 1])) {
    start -= 1
  }
  let end = matchIndex + matchLength
  while (end < text.length && !boundary.test(text[end])) {
    end += 1
  }
  const sentence = text.slice(start, end).trim()
  return sentence || text.slice(matchIndex, matchIndex + matchLength)
}

/**
 * Run every rule over the stored conversation text. Pure and synchronous — no model call, no I/O —
 * which is the entire point: the same input always produces the same output.
 */
export function checkDeterministicRisks(conversationText: string | undefined | null): ConversationIssue[] {
  const text = (conversationText ?? '').trim()
  if (!text) {
    return []
  }

  const hits: ConversationIssue[] = []
  const seen = new Set<string>()

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rule.pattern.exec(text))) {
      const evidence = extractSentence(text, match.index, match[0].length)
      const key = `${rule.category}:${evidence.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        hits.push({
          category: rule.category,
          severity: rule.severity,
          detail: `系统规则命中：${RISK_CATEGORY_LABELS[rule.category] ?? rule.category}`,
          evidence,
          source: 'rule'
        })
      }
      if (match[0].length === 0) {
        rule.pattern.lastIndex += 1
      }
    }
  }

  return hits
}

function dedupeKey(category: string, evidence: string | undefined) {
  return `${category}:${(evidence ?? '').trim().toLowerCase()}`
}

/**
 * Add rule hits the model did not already report, matched on category + evidence sentence so the
 * same wording is never counted twice under the same category. Called unconditionally when saving
 * an analysis — see conversation-review.middleware.ts — so a model that never calls
 * `conversation_review_check_rules` still ends up with the same deterministic risks on record as
 * one that did.
 */
export function mergeDeterministicRisks(
  modelRisks: ConversationIssue[] | undefined,
  ruleHits: ConversationIssue[]
): ConversationIssue[] | undefined {
  if (!ruleHits.length) {
    return modelRisks
  }
  const existingKeys = new Set((modelRisks ?? []).map((risk) => dedupeKey(risk.category, risk.evidence)))
  const additions = ruleHits.filter((hit) => !existingKeys.has(dedupeKey(hit.category, hit.evidence)))
  if (!additions.length) {
    return modelRisks
  }
  return [...(modelRisks ?? []), ...additions]
}
