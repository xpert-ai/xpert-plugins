export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export interface TicketAnalysis {
  category: string; priority: TicketPriority; summary: string; suggestedReply: string; confidence: number; evidence: string[]
}

export function normalizeAnalysis(input: TicketAnalysis): TicketAnalysis {
  const category = input.category.trim()
  const summary = input.summary.trim()
  const suggestedReply = input.suggestedReply.trim()
  if (!category || !summary || !suggestedReply) throw new Error('Analysis requires category, summary, and suggestedReply')
  return {
    category, priority: input.priority, summary, suggestedReply,
    confidence: Math.min(1, Math.max(0, input.confidence)),
    evidence: [...new Set(input.evidence.map((item) => item.trim()).filter(Boolean))].slice(0, 8)
  }
}
