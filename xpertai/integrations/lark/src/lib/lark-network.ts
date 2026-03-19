import axios, { AxiosRequestConfig } from 'axios'
import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)

type TLarkProxyKind = 'http' | 'socks' | null

type TLarkProxyTransport = {
  proxyUrl: string | null
  kind: TLarkProxyKind
  note: string | null
  httpAgent?: any
  httpsAgent?: any
  wsAgent?: any
}

type TTargetProtocol = 'http:' | 'https:' | 'ws:' | 'wss:'

function requireDependency(name: string): any {
  try {
    return require(name)
  } catch {}

  try {
    return require(path.join(process.cwd(), 'node_modules', name))
  } catch {}

  throw new Error(`Required proxy dependency "${name}" is not available from the plugin or host workspace.`)
}

function readProxyUrl(targetProtocol: TTargetProtocol): string | null {
  const env = process.env
  const isSecure = targetProtocol === 'https:' || targetProtocol === 'wss:'
  const protocolSpecific = isSecure
    ? env.LARK_HTTPS_PROXY || env.XPERT_LARK_HTTPS_PROXY
    : env.LARK_HTTP_PROXY || env.XPERT_LARK_HTTP_PROXY

  return (
    protocolSpecific ||
    env.LARK_PROXY_URL ||
    env.XPERT_LARK_PROXY_URL ||
    env.XPERT_OUTBOUND_PROXY_URL ||
    (isSecure ? env.HTTPS_PROXY || env.https_proxy : env.HTTP_PROXY || env.http_proxy) ||
    env.ALL_PROXY ||
    env.all_proxy ||
    null
  )
}

function normalizeProxyUrl(rawProxyUrl: string | null): { proxyUrl: string | null; note: string | null } {
  if (!rawProxyUrl) {
    return { proxyUrl: null, note: null }
  }

  try {
    const parsed = new URL(rawProxyUrl)
    let note: string | null = null
    const isLocal =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1'
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLocal && (parsed.port === '1080' || parsed.port === '10808')) {
      note =
        `Proxy ${rawProxyUrl} is configured as HTTP(S). If this endpoint is actually a SOCKS proxy, set ` +
        `LARK_PROXY_URL=socks5://${parsed.hostname}:${parsed.port} explicitly instead of relying on generic HTTP(S)_PROXY.`
    }

    return {
      proxyUrl: parsed.toString(),
      note
    }
  } catch {
    return {
      proxyUrl: rawProxyUrl,
      note: null
    }
  }
}

function buildTransport(targetProtocol: TTargetProtocol): TLarkProxyTransport {
  const { proxyUrl, note } = normalizeProxyUrl(readProxyUrl(targetProtocol))
  if (!proxyUrl) {
    return {
      proxyUrl: null,
      kind: null,
      note: null
    }
  }

  const parsed = new URL(proxyUrl)
  if (parsed.protocol.startsWith('socks')) {
    const { SocksProxyAgent } = requireDependency('socks-proxy-agent') as { SocksProxyAgent: new (proxyUrl: string) => any }
    const agent = new SocksProxyAgent(proxyUrl)
    return {
      proxyUrl,
      kind: 'socks',
      note,
      httpAgent: agent,
      httpsAgent: agent,
      wsAgent: agent
    }
  }

  const { HttpProxyAgent } = requireDependency('http-proxy-agent') as { HttpProxyAgent: new (proxyUrl: string) => any }
  const { HttpsProxyAgent } = requireDependency('https-proxy-agent') as { HttpsProxyAgent: new (proxyUrl: string) => any }

  return {
    proxyUrl,
    kind: 'http',
    note,
    httpAgent: new HttpProxyAgent(proxyUrl),
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    wsAgent: targetProtocol === 'ws:' ? new HttpProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl)
  }
}

export function getLarkAxiosRequestConfig(targetProtocol: TTargetProtocol = 'https:'): AxiosRequestConfig {
  const transport = buildTransport(targetProtocol)
  if (!transport.proxyUrl) {
    return {}
  }

  return {
    proxy: false,
    httpAgent: transport.httpAgent,
    httpsAgent: transport.httpsAgent
  }
}

export function createLarkHttpInstance(targetProtocol: TTargetProtocol = 'https:'): any {
  const transport = buildTransport(targetProtocol)
  const instance = axios.create({
    ...(transport.proxyUrl
      ? {
          proxy: false,
          httpAgent: transport.httpAgent,
          httpsAgent: transport.httpsAgent
        }
      : {})
  })

  const unwrap = <T>(promise: Promise<{ data: T }>) => promise.then((response) => response.data as T)

  return {
    request: <T = any>(config: AxiosRequestConfig) => unwrap<T>(instance.request<T>(config)),
    get: <T = any>(url: string, config?: AxiosRequestConfig) => unwrap<T>(instance.get<T>(url, config)),
    delete: <T = any>(url: string, config?: AxiosRequestConfig) => unwrap<T>(instance.delete<T>(url, config)),
    head: <T = any>(url: string, config?: AxiosRequestConfig) => unwrap<T>(instance.head<T>(url, config)),
    options: <T = any>(url: string, config?: AxiosRequestConfig) => unwrap<T>(instance.options<T>(url, config)),
    post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => unwrap<T>(instance.post<T>(url, data, config)),
    put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => unwrap<T>(instance.put<T>(url, data, config)),
    patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => unwrap<T>(instance.patch<T>(url, data, config))
  }
}

export function getLarkWebSocketAgent(targetProtocol: 'ws:' | 'wss:' = 'wss:'): any | undefined {
  return buildTransport(targetProtocol).wsAgent
}

export function describeLarkProxy(targetProtocol: TTargetProtocol = 'https:') {
  const transport = buildTransport(targetProtocol)
  return {
    proxyUrl: transport.proxyUrl,
    kind: transport.kind,
    note: transport.note
  }
}
