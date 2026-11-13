import type { EditableItem } from './schemas.js'
export interface Scope { tenantId: string; organizationId: string; ownerUserId: string; assistantId: string }
export interface ToolScope extends Scope { conversationId: string; agentKey: string }
export interface Segment { id: string; start: number; end: number }
export interface Segments { schemaVersion: 1; offsetUnit: 'utf16'; segments: Segment[] }
export interface ReviewItem extends EditableItem {
  sourceSegmentIds: string[]; origin: 'ai' | 'manual'; humanAdjusted: boolean; reviewNote: string | null
}
export type RecordStatus = 'processing' | 'review_ready' | 'confirmed' | 'failed'
export type AttemptStatus = 'queued' | 'dispatching' | 'running' | 'succeeded' | 'failed' | 'timed_out'
export interface Installation { tenantId: string | null; scopeKey: string | null }
export class DomainError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'DomainError' }
}
export function fail(code: string): never { throw new DomainError(code) }
