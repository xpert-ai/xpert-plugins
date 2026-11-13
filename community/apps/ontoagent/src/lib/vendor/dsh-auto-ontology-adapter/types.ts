import type { Assertion, Node } from '../dsh-ontology-core/index.js'

export interface AutoTermCertification {
  id: string
  name?: string
  certification?: string
  certified?: boolean
  synonyms?: string[]
}

export interface AutoSnapshotInput {
  yaml: string
  terms: AutoTermCertification[]
  source?: string
  adapterVersion?: string
}

export interface AutoOntologyPort {
  readSnapshot(): Promise<AutoSnapshotInput>
}

export interface ExcludedTerm {
  id: string
  name: string
  certification: string
}

export interface NormalizedAutoSnapshot {
  source: string
  adapterVersion: string
  sourceDigest: string
  nodes: Node[]
  assertions: Assertion[]
  excluded: ExcludedTerm[]
  unsupported: string[]
}

export interface AutoSyncManifest {
  source: string
  adapterVersion: string
  sourceDigest: string
  mirrorVersion: string
  assertionCount: number
  excluded: ExcludedTerm[]
  unsupported: string[]
  stale?: boolean
  lastError?: string
}

export interface AutoSyncResult {
  status: 'applied' | 'unchanged' | 'sync_unstable' | 'offline'
  sourceDigest?: string
  mirrorVersion: string
  changed: boolean
  excluded: ExcludedTerm[]
  unsupported: string[]
  attempts: number
}
