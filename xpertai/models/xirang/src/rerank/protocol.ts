import {
  getXirangBaseUrl,
  XirangDefaultBaseUrl,
  type XirangModelCredentials
} from '../types.js'

export type XirangRerankRequest = {
  path: string
  authorization: string
  official: boolean
  protocol: 'flat' | 'nested'
}

export type XirangRerankResponseItem = {
  index?: number
  relevance_score?: number
}

export type XirangRerankPayload = {
  code?: number
  error?: { code?: string | number; message?: string; type?: string }
  results?: XirangRerankResponseItem[]
  output?: { results?: XirangRerankResponseItem[] }
}

type XirangPredefinedRerankModel = {
  aliases: readonly string[]
  modelId: string
  path: string
  protocol: 'flat' | 'nested'
}

const XIRANG_PREDEFINED_RERANK_MODELS: readonly XirangPredefinedRerankModel[] = [
  {
    aliases: ['BGE-Reranker-Large', 'bge-reranker-large', '0cb4c1ed8f374eadbe8bffe30bd039dc'],
    modelId: '0cb4c1ed8f374eadbe8bffe30bd039dc',
    path: '/rerank',
    protocol: 'flat'
  },
  {
    aliases: ['BGE-Reranker-V2-m3', 'bge-reranker-v2-m3', 'fdfd185a79494673b65451956cf5b4ba'],
    modelId: 'fdfd185a79494673b65451956cf5b4ba',
    path: '/rerank',
    protocol: 'flat'
  },
  {
    aliases: ['qwen3-rerank', 'a18944d8204c4e969cd4635c28af56e5'],
    modelId: 'a18944d8204c4e969cd4635c28af56e5',
    path: '/reranks',
    protocol: 'flat'
  },
  {
    aliases: ['gte-rerank-v2', 'c5f2125a07474e31b6926e184ea8627e'],
    modelId: 'c5f2125a07474e31b6926e184ea8627e',
    path: '/services/rerank/text-rerank/text-rerank',
    protocol: 'nested'
  }
]

function normalizePath(path?: string): string {
  const value = path?.trim() || '/rerank'
  return value.startsWith('/') ? value : `/${value}`
}

function resolvePredefinedRerankModel(model?: string): XirangPredefinedRerankModel | undefined {
  const normalized = model?.trim().toLowerCase()
  if (!normalized) return undefined
  return XIRANG_PREDEFINED_RERANK_MODELS.find((candidate) => candidate.aliases.some((alias) => alias.toLowerCase() === normalized))
}

export function isOfficialXirangRerank(credentials: XirangModelCredentials, path = normalizePath(credentials.rerank_path)): boolean {
  return getXirangBaseUrl(credentials) === XirangDefaultBaseUrl && [
    '/rerank',
    '/reranks',
    '/services/rerank/text-rerank/text-rerank'
  ].includes(path)
}

export function getRerankModelId(model: string, credentials: XirangModelCredentials): string {
  const endpointModel = credentials.endpoint_model_name?.trim()
  if (endpointModel) return endpointModel

  const predefined = resolvePredefinedRerankModel(model)
  const configuredPath = credentials.rerank_path?.trim()
  const defaultPath = normalizePath(configuredPath || predefined?.path)
  const usesPredefinedContract = getXirangBaseUrl(credentials) === XirangDefaultBaseUrl &&
    predefined != null && (!configuredPath || defaultPath === predefined.path)
  if (usesPredefinedContract) return predefined.modelId

  if (isOfficialXirangRerank(credentials, defaultPath)) {
    throw new Error('请填写 API 使用的模型名称（天翼云模型详情页顶部的模型 ID，不是模型展示名）')
  }

  const fallbackModel = model?.trim()
  if (!fallbackModel) throw new Error('Rerank 模型名称不能为空')
  return fallbackModel
}

export function getRerankRequest(credentials: XirangModelCredentials, model?: string): XirangRerankRequest {
  const defaultEndpoint = getXirangBaseUrl(credentials) === XirangDefaultBaseUrl
  const predefined = defaultEndpoint ? resolvePredefinedRerankModel(model) : undefined
  const configuredPath = credentials.rerank_path?.trim()
  const path = normalizePath(configuredPath || predefined?.path)
  const official = isOfficialXirangRerank(credentials, path)
  const key = credentials.rerank_api_key?.trim() || credentials.app_key?.trim()
  if (!key) throw new Error('天翼云 AppKey 不能为空')

  // The official Tianyi endpoints always require Bearer authentication.
  const scheme = official
    ? 'bearer'
    : credentials.rerank_auth_scheme?.trim().toLowerCase() || 'bearer'
  if (scheme !== 'raw' && scheme !== 'bearer') {
    throw new Error(`不支持的 Rerank 鉴权方式: ${scheme}`)
  }
  const authorization = scheme === 'bearer'
    ? /^bearer\s+/i.test(key) ? key : `Bearer ${key}`
    : key

  const protocol = configuredPath
    ? path === '/services/rerank/text-rerank/text-rerank' ? 'nested' : 'flat'
    : predefined?.protocol || 'flat'

  return { path, authorization, official, protocol }
}

export function buildRerankBody(
  model: string,
  query: string,
  documents: string[],
  topN: number,
  credentials: XirangModelCredentials,
  request: Pick<XirangRerankRequest, 'official' | 'protocol'>
): Record<string, unknown> {
  if (request.protocol === 'nested') {
    return {
      model,
      input: { query, documents },
      parameters: {
        return_documents: false,
        top_n: topN
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    query,
    documents,
    top_n: topN
  }
  if (request.official) {
    body.return_documents = false
  } else if (credentials.rerank_instruct?.trim()) {
    body.instruct = credentials.rerank_instruct.trim()
  }
  return body
}

export function extractRerankResults(payload: XirangRerankPayload): XirangRerankResponseItem[] | undefined {
  if (Array.isArray(payload.results)) return payload.results
  if (Array.isArray(payload.output?.results)) return payload.output.results
  return undefined
}

export function mapRerankResults(
  results: XirangRerankResponseItem[],
  scoreThreshold?: number,
  topN = results.length
): Array<{ index: number; relevanceScore: number }> {
  return results
    .map((result, index) => ({
      index: Number.isInteger(result.index) ? Number(result.index) : index,
      relevanceScore: Number(result.relevance_score ?? 0)
    }))
    .filter((result) => scoreThreshold == null || result.relevanceScore >= scoreThreshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topN)
}
