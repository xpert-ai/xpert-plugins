import { zipSync } from 'fflate'
import { z } from 'zod/v3'
import { limits, referenceSchema, digestSchema, kindSchema, resourceV2Schema, identity, type ResourceDocumentV2, type ResourceReference } from './resource-contract'
import { canonicalJson, parseLibraryJson, resourceBytes, resourceHash, sha256 } from './resource-json'
import { validateAsset } from './asset-validation'
import { readZipFiles, validateZipDirectory } from './zip-container'

const manifestSchema = z.object({ schema: z.literal('xpert.library.archive'), archiveVersion: z.literal(2), mode: z.literal('complete'),
  roots: z.array(referenceSchema).min(1).max(limits.resources),
  resources: z.array(referenceSchema.extend({ kind: kindSchema, size: z.number().int().positive().max(limits.documentBytes) }).strict()).min(1).max(limits.resources),
  blobs: z.array(z.object({ sha256: digestSchema, size: z.number().int().positive().max(limits.assetBytes) }).strict()).max(limits.assets) }).strict()
const policy = { entries: limits.resources + limits.assets + 1, entryBytes: limits.assetBytes, totalBytes: limits.expandedBytes,
  name: /^(manifest\.json|resources\/[a-f0-9]{64}\.json|blobs\/sha256\/[a-f0-9]{64})$/, ratio: limits.compressionRatio }
export type ResourcePackage = { roots: ResourceReference[]; resources: ResourceDocumentV2[]; blobs: Map<string, Buffer> }
const fail = (code: string): never => { throw new Error(`LIBRARY_ARCHIVE_${code}`) }
export const reference = (document: ResourceDocumentV2): ResourceReference => ({ logicalId: document.logicalId, version: document.version, sha256: resourceHash(document) })

/** Return dependencies first. All identities, digests and attachments form one closed graph. */
export function validatePackage(input: ResourcePackage): ResourceDocumentV2[] {
  if (!input.roots.length || input.roots.length > limits.resources || input.resources.length > limits.resources || input.blobs.size > limits.assets) fail('LIMIT')
  const resources = input.resources.map(d => resourceV2Schema.parse(d)), byId = new Map(resources.map(d => [identity(d), d]))
  if (byId.size !== resources.length || new Set(input.roots.map(identity)).size !== input.roots.length) fail('DUPLICATE')
  const seen = new Set<string>(), active = new Set<string>(), used = new Set<string>(), result: ResourceDocumentV2[] = []
  let total = 0
  const visit = (ref: ResourceReference, kind?: ResourceDocumentV2['kind']) => {
    referenceSchema.parse(ref)
    const key = identity(ref), document = byId.get(key)
    if (!document) fail('DEPENDENCY_MISSING')
    if (resourceHash(document!) !== ref.sha256 || kind && document!.kind !== kind) fail('DEPENDENCY_INTEGRITY')
    if (active.has(key)) fail('CYCLE')
    if (seen.has(key)) return
    active.add(key)
    for (const dep of document!.dependencies) visit({ logicalId: dep.logicalId, version: dep.version, sha256: dep.sha256 }, dep.kind)
    for (const asset of document!.assets) {
      const bytes = input.blobs.get(asset.sha256)
      if (!bytes) fail('ASSET_MISSING')
      validateAsset(asset, bytes!)
      if (!used.has(asset.sha256)) { total += bytes!.length; used.add(asset.sha256) }
    }
    total += resourceBytes(document!).length
    if (total > limits.expandedBytes) fail('LIMIT')
    active.delete(key); seen.add(key); result.push(document!)
  }
  input.roots.forEach(ref => visit(ref))
  if (seen.size !== byId.size || used.size !== input.blobs.size) fail('UNREFERENCED')
  return result
}
export function encodePackage(input: ResourcePackage): Buffer {
  const resources = validatePackage(input).sort((a, b) => identity(a).localeCompare(identity(b)))
  const manifest = manifestSchema.parse({ schema: 'xpert.library.archive', archiveVersion: 2, mode: 'complete',
    roots: [...input.roots].sort((a, b) => identity(a).localeCompare(identity(b))),
    resources: resources.map(document => ({ ...reference(document), kind: document.kind, size: resourceBytes(document).length })),
    blobs: [...input.blobs].sort(([a], [b]) => a.localeCompare(b)).map(([sha256, bytes]) => ({ sha256, size: bytes.length })) })
  const files: Record<string, Uint8Array> = { 'manifest.json': Buffer.from(canonicalJson(manifest)) }
  for (const doc of resources) files[`resources/${resourceHash(doc)}.json`] = resourceBytes(doc)
  for (const item of manifest.blobs) files[`blobs/sha256/${item.sha256}`] = input.blobs.get(item.sha256)!
  const bytes = Buffer.from(zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) }))
  if (bytes.length > limits.archiveBytes) fail('LIMIT')
  validateZipDirectory(bytes, policy)
  return bytes
}
export function decodePackage(bytes: Buffer): ResourcePackage {
  if (!bytes.length || bytes.length > limits.archiveBytes) fail('LIMIT')
  const files = readZipFiles(bytes, policy), manifestBytes = files.get('manifest.json')
  if (!manifestBytes) fail('MANIFEST')
  const manifest = manifestSchema.parse(parseLibraryJson(manifestBytes!))
  if (new Set(manifest.resources.map(r => r.sha256)).size !== manifest.resources.length || new Set(manifest.blobs.map(b => b.sha256)).size !== manifest.blobs.length || files.size !== 1 + manifest.resources.length + manifest.blobs.length) fail('DUPLICATE')
  const read = (path: string, info: { sha256: string; size: number }) => {
    const file = files.get(path)
    if (!file || file.length !== info.size || sha256(file) !== info.sha256) fail('INTEGRITY')
    return file!
  }
  const resources = manifest.resources.map(info => {
    const raw = read(`resources/${info.sha256}.json`, info), doc = resourceV2Schema.parse(parseLibraryJson(raw))
    if (identity(doc) !== identity(info) || doc.kind !== info.kind || !resourceBytes(doc).equals(raw)) fail('INTEGRITY')
    return doc
  })
  const result = { roots: manifest.roots, resources, blobs: new Map(manifest.blobs.map(info => [info.sha256, read(`blobs/sha256/${info.sha256}`, info)])) }
  result.resources = validatePackage(result)
  return result
}
/** Recompute dependency hashes in topological order; the saved map makes interrupted copies deterministic. */
export function remapPackage(input: ResourcePackage, ids: Record<string, string>): ResourcePackage {
  const mapped = new Map<string, ResourceDocumentV2>()
  for (const doc of validatePackage(input)) {
    const next = resourceV2Schema.parse({ ...doc, logicalId: ids[doc.logicalId], dependencies: doc.dependencies.map(dep => {
      const target = mapped.get(identity(dep))!
      return { ...dep, ...reference(target) }
    }) })
    mapped.set(identity(doc), next)
  }
  const result = { resources: [...mapped.values()], blobs: input.blobs, roots: input.roots.map(ref => reference(mapped.get(identity(ref))!)) }
  validatePackage(result)
  return result
}
