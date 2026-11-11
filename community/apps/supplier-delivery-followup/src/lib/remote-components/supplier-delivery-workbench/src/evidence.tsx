import { React } from './vendor'
import type { EvidenceField, ProposalDto } from '../../../workbench-contract'

const { useEffect, useMemo, useRef } = React

export interface EvidenceTarget {
  proposalId: string
  field: EvidenceField
  /** Changes on every request so the same target can be flashed twice. */
  nonce: number
}

interface Range {
  start: number
  end: number
  proposalId: string
  field: EvidenceField
}

interface Segment {
  text: string
  ranges: Range[]
}

/** Split the raw text at every evidence boundary so overlapping quotes stay readable. */
function segment(text: string, ranges: Range[]): Segment[] {
  const cuts = new Set<number>([0, text.length])
  for (const range of ranges) {
    cuts.add(Math.max(0, Math.min(text.length, range.start)))
    cuts.add(Math.max(0, Math.min(text.length, range.end)))
  }
  const points = [...cuts].sort((left, right) => left - right)
  const segments: Segment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (end <= start) continue
    segments.push({
      text: text.slice(start, end),
      ranges: ranges.filter((range) => range.start <= start && range.end >= end)
    })
  }
  return segments
}

export function EvidenceText({
  text,
  proposals,
  activeProposalId,
  target,
  label
}: {
  text: string
  proposals: ProposalDto[]
  activeProposalId: string | null
  target: EvidenceTarget | null
  label: string
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const ranges = useMemo(
    () =>
      proposals.flatMap((proposal) =>
        proposal.evidence
          .filter((item) => item.end > item.start)
          .map((item) => ({ start: item.start, end: item.end, proposalId: proposal.id, field: item.field }))
      ),
    [proposals]
  )
  const segments = useMemo(() => segment(text, ranges), [text, ranges])

  useEffect(() => {
    if (!target || !container.current) return
    const key = `${target.proposalId}:${target.field}`
    const marks = [...container.current.querySelectorAll<HTMLElement>('mark[data-evidence]')].filter((mark) =>
      (mark.dataset.evidence ?? '').split(' ').includes(key)
    )
    if (!marks.length) return
    marks[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    for (const mark of marks) mark.dataset.flash = 'true'
    const timer = window.setTimeout(() => marks.forEach((mark) => delete mark.dataset.flash), 1200)
    return () => window.clearTimeout(timer)
  }, [target])

  return (
    <div ref={container} aria-label={label} className="whitespace-pre-wrap break-words text-sm leading-7">
      {segments.map((part, index) => {
        if (!part.ranges.length) return <span key={index}>{part.text}</span>
        const active = activeProposalId !== null && part.ranges.some((range) => range.proposalId === activeProposalId)
        return (
          <mark
            key={index}
            data-evidence={part.ranges.map((range) => `${range.proposalId}:${range.field}`).join(' ')}
            data-active={active ? 'true' : undefined}
            className="sdf-evidence"
          >
            {part.text}
          </mark>
        )
      })}
    </div>
  )
}
