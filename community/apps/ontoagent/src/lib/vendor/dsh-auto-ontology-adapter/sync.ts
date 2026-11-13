import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalJson, type Op } from '../dsh-ontology-core/index.js'
import { OntologyStore } from '../dsh-ontology-store/index.js'
import { normalizeAutoSnapshot } from './normalize.js'
import type { AutoOntologyPort, AutoSyncManifest, AutoSyncResult, NormalizedAutoSnapshot } from './types.js'

export const AUTO_MANIFEST_FILE = 'auto-source.json'

export function readAutoSyncManifest(storeDir: string): AutoSyncManifest | null {
  const path = join(storeDir, AUTO_MANIFEST_FILE)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as AutoSyncManifest
}

function writeManifest(storeDir: string, manifest: AutoSyncManifest): void {
  mkdirSync(storeDir, { recursive: true })
  const path = join(storeDir, AUTO_MANIFEST_FILE)
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n')
  renameSync(tmp, path)
}

export function applyNormalizedSnapshot(store: OntologyStore, snapshot: NormalizedAutoSnapshot, storeDir: string): AutoSyncResult {
  const current = [...store.foldCached().values()]
  const desired = new Map(snapshot.assertions.map((assertion) => [assertion.id, assertion]))
  const currentById = new Map(current.map((assertion) => [assertion.id, assertion]))
  const ops: Op[] = []
  for (const assertion of snapshot.assertions) {
    const before = currentById.get(assertion.id)
    if (before === undefined || canonicalJson(before) !== canonicalJson(assertion)) ops.push({ op: 'assert', assertion })
  }
  for (const assertion of current) {
    if (!desired.has(assertion.id) && assertion.status !== 'retracted') {
      ops.push({ op: 'retract', target: assertion.id, reason: 'auto_source_removed:' + snapshot.sourceDigest })
    }
  }
  ops.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))
  if (ops.length > 0) {
    store.append(ops)
    store.snapshot()
  }
  const mirrorVersion = store.version()
  const manifest: AutoSyncManifest = {
    source: snapshot.source,
    adapterVersion: snapshot.adapterVersion,
    sourceDigest: snapshot.sourceDigest,
    mirrorVersion,
    assertionCount: snapshot.assertions.length,
    excluded: snapshot.excluded,
    unsupported: snapshot.unsupported,
  }
  const previous = readAutoSyncManifest(storeDir)
  if (ops.length > 0 || canonicalJson(previous) !== canonicalJson(manifest)) writeManifest(storeDir, manifest)
  return {
    status: ops.length > 0 ? 'applied' : 'unchanged',
    sourceDigest: snapshot.sourceDigest,
    mirrorVersion,
    changed: ops.length > 0,
    excluded: snapshot.excluded,
    unsupported: snapshot.unsupported,
    attempts: 1,
  }
}

export async function syncAutoOntology(options: {
  port: AutoOntologyPort
  storeDir: string
  maxAttempts?: number
}): Promise<AutoSyncResult> {
  const store = new OntologyStore(options.storeDir)
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2)
  let lastDigest = ''
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const first = normalizeAutoSnapshot(await options.port.readSnapshot())
      const second = normalizeAutoSnapshot(await options.port.readSnapshot())
      lastDigest = second.sourceDigest
      if (first.sourceDigest !== second.sourceDigest) continue
      const result = applyNormalizedSnapshot(store, second, options.storeDir)
      return { ...result, attempts: attempt }
    }
  } catch (err) {
    const previous = readAutoSyncManifest(options.storeDir)
    if (previous === null) throw err
    const lastError = String((err as Error)?.message ?? err)
    writeManifest(options.storeDir, { ...previous, mirrorVersion: store.version(), stale: true, lastError })
    return {
      status: 'offline', sourceDigest: previous.sourceDigest, mirrorVersion: store.version(), changed: false,
      excluded: previous.excluded, unsupported: previous.unsupported, attempts: 1,
    }
  }
  const previous = readAutoSyncManifest(options.storeDir)
  if (previous !== null) writeManifest(options.storeDir, { ...previous, mirrorVersion: store.version(), stale: true, lastError: 'sync_unstable' })
  return {
    status: 'sync_unstable',
    sourceDigest: lastDigest,
    mirrorVersion: store.version(),
    changed: false,
    excluded: previous?.excluded ?? [],
    unsupported: previous?.unsupported ?? [],
    attempts: maxAttempts,
  }
}
