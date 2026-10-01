import { createHash, randomBytes } from 'node:crypto'

export function createPkce(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 32 || bytes > 96) throw new Error('Invalid PKCE entropy size')
  const codeVerifier = randomBytes(bytes).toString('base64url')
  return { codeVerifier, codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url') }
}

export function authorizationUrl(endpoint: string, parameters: Record<string, string | undefined>): string {
  const url = httpsEndpoint(endpoint)
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  return url.toString()
}

export type OAuthTokenRequest = {
  endpoint: string
  encoding: 'form' | 'json' | 'query'
  values: Record<string, string>
  basicAuth?: { clientId: string; clientSecret: string }
  headers?: Record<string, string>
  signal?: AbortSignal
}

/** Query encoding is an explicit opt-in for providers such as Baidu. Never follows redirects. */
export function oauthTokenRequest(input: OAuthTokenRequest): Promise<Response> {
  const url = httpsEndpoint(input.endpoint)
  const headers: Record<string, string> = { Accept: 'application/json', ...input.headers }
  if (input.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${input.basicAuth.clientId}:${input.basicAuth.clientSecret}`).toString('base64')}`
  }
  let body: string | URLSearchParams | undefined
  if (input.encoding === 'query') {
    for (const [key, value] of Object.entries(input.values)) url.searchParams.set(key, value)
  } else if (input.encoding === 'json') {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(input.values)
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(input.values)
  }
  return fetch(input.encoding === 'query' ? url : url.toString(), {
    method: input.encoding === 'query' ? 'GET' : 'POST', headers,
    ...(body === undefined ? {} : { body }),
    redirect: 'error', signal: input.signal ?? AbortSignal.timeout(30_000)
  })
}

function httpsEndpoint(endpoint: string): URL {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Connector endpoints must use HTTPS without embedded credentials or fragments')
  }
  return url
}
