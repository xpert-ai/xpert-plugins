/**
 * 证据解析端口（纯类型）：本体 gate 外预解析 `mem:` 引用。
 * 记忆插件实现；本体插件只依赖此接口，不 import 记忆实现。解析不是记忆形成/目录/读取的必经路径。
 */
export type EvidenceDisposition = 'active' | 'superseded' | 'forgotten' | 'excluded' | 'staged' | 'unknown'

export interface EvidenceRef {
  locator: string
  digest?: string
}

export interface ResolvedEvidence {
  exists: boolean
  digestOk: boolean
  disposition: EvidenceDisposition
  speaker?: string
  subjectId?: string
  reason?: string
}

export interface EvidenceResolveOptions {
  /** 调用方认证主体；解析器据此判定跨主体 excluded */
  subjectId?: string
}

export interface EvidenceResolver {
  resolve(ref: EvidenceRef, opts?: EvidenceResolveOptions): Promise<ResolvedEvidence> | ResolvedEvidence
}
