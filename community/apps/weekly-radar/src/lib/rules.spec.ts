import assert from 'node:assert/strict'
import { scanRisks, weekKeyOf, type RadarEntrySnapshot } from './rules.ts'

const NOW = new Date('2026-11-08T09:00:00.000Z')

function entry(partial: Partial<RadarEntrySnapshot> & { id: string }): RadarEntrySnapshot {
  return {
    title: `entry-${partial.id}`,
    status: 'in_progress',
    weekKey: '2026-W45',
    createdAt: new Date('2026-11-01T09:00:00.000Z'),
    lastTouchedAt: new Date('2026-11-01T09:00:00.000Z'),
    ...partial
  }
}

const aged = new Date('2026-11-01T00:00:00.000Z')

const crossWeek = scanRisks(
  [entry({ id: 'a', status: 'in_progress', weekKey: '2026-W44', lastTouchedAt: aged })],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.equal(crossWeek.length, 1)
assert.ok(crossWeek[0].reasons.some((r) => r.includes('R1')), 'expected R1 cross week open')
assert.equal(crossWeek[0].level, 'high', 'a 7 day aged cross week entry must be high risk')

const closed = scanRisks(
  [entry({ id: 'b', status: 'done', weekKey: '2026-W44', lastTouchedAt: aged })],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.equal(closed.length, 0, 'closed entries must not raise risks')

const pending = scanRisks(
  [entry({ id: 'c', status: 'pending_confirm', lastTouchedAt: new Date('2026-11-04T00:00:00.000Z') })],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.ok(pending[0].reasons.some((r) => r.includes('R2')), 'expected R2 pending confirm backlog')

const failed = scanRisks([entry({ id: 'd', status: 'ai_failed' })], { now: NOW, currentWeekKey: '2026-W45' })
assert.ok(failed[0].reasons.some((r) => r.includes('R3')), 'expected R3 failed not retried')
assert.equal(failed[0].level, 'high')

const overdue = scanRisks(
  [entry({ id: 'e', status: 'planned', dueDate: '2026-10-30', lastTouchedAt: new Date('2026-11-05T00:00:00.000Z') })],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.ok(overdue[0].reasons.some((r) => r.includes('R4')), 'expected R4 overdue')

const recurring = scanRisks(
  [
    entry({ id: 'f', title: '报价系统对接', status: 'blocked', weekKey: '2026-W44' }),
    entry({ id: 'g', title: '报价系统对接!', status: 'blocked', weekKey: '2026-W45' })
  ],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.ok(
  recurring.some((risk) => risk.id.startsWith('recurring:') && risk.level === 'high'),
  'expected R5 recurring blocked'
)

const merged = scanRisks(
  [
    entry({
      id: 'h',
      status: 'pending_confirm',
      weekKey: '2026-W43',
      dueDate: '2026-10-01',
      lastTouchedAt: new Date('2026-10-20T00:00:00.000Z')
    })
  ],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.equal(merged.length, 1, 'reasons of one entry must be merged into one risk')
assert.ok(merged[0].reasons.length >= 3, `expected 3 reasons, got ${merged[0].reasons.join(' | ')}`)

const replay = scanRisks(
  [entry({ id: 'a', status: 'in_progress', weekKey: '2026-W44', lastTouchedAt: aged })],
  { now: NOW, currentWeekKey: '2026-W45' }
)
assert.deepEqual(replay, crossWeek, 'the same inputs must produce the same risks')

assert.equal(weekKeyOf(new Date('2026-11-08T00:00:00.000Z')), '2026-W45')
assert.equal(weekKeyOf(new Date('2026-01-01T00:00:00.000Z')), '2026-W01')

console.log('rules smoke test passed')
