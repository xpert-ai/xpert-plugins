import {
  getXirangBaseUrl,
  XirangDefaultBaseUrl,
  type XirangModelCredentials
} from '../types.js'

export type XirangRerankRequest = {
  path: string
  authorization: string
  official: boolean
}

export type XirangRerankResponseItem = {
  index?: number
  relevance_score?: number
}

function normalizePath(path?: string): string {
  const value = path?.trim() || '/rerank'
  return value.startsWith('/') ? value : `/${value}`
}

export function isOfficialXirangRerank(credentials: XirangModelCredentials, path = normalizePath(credentials.rerank_path)): boolean {
  return getXirangBaseUrl(credentials) === XirangDefaultBaseUrl && path === '/rerank'
}

export function getRerankModelId(model: string, credentials: XirangModelCredentials): string {
  const endpointModel = credentials.endpoint_model_name?.trim()
  if (endpointModel) return endpointModel

  if (isOfficialXirangRerank(credentials)) {
    throw new Error('请填写 API 使用的模型名称（天翼云模型详情页顶部的模型 ID，不是 qwen3-rerank 展示名）')
  }

  const fallbackModel = model?.trim()
  if (!fallbackModel) throw new Error('Rerank 模型名称不能为空')
  return fallbackModel
}

export function getRerankRequest(credentials: XirangModelCredentials): XirangRerankRequest {
  const configuredPath = credentials.rerank_path?.trim()
  const path = normalizePath(configuredPath)
  const official = isOfficialXirangRerank(credentials, path)
  const key = credentials.rerank_api_key?.trim() || credentials.app_key?.trim()
  if (!key) throw new Error('天翼云 AppKey 不能为空')

  // The official Reranker API always requires Bearer, including for models
  // saved before the plugin corrected its former raw-AppKey default.
  const scheme = official
    ? 'bearer'
    : credentials.rerank_auth_scheme?.trim().toLowerCase() || 'bearer'
  if (scheme !== 'raw' && scheme !== 'bearer') {
    throw new Error(`不支持的 Rerank 鉴权方式: ${scheme}`)
  }
  const authorization = scheme === 'bearer'
    ? /^bearer\s+/i.test(key) ? key : `Bearer ${key}`
    : key

  return { path, authorization, official }
}

export function buildRerankBody(
  model: string,
  query: string,
  documents: string[],
  topN: number,
  credentials: XirangModelCredentials,
  request: Pick<XirangRerankRequest, 'official'>
): Record<string, unknown> {
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
