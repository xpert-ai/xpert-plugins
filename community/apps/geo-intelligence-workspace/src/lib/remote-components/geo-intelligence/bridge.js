;(function () {
  const channel = 'xpertai.remote_component'
  const origins = new Set(window.__GEO_PARENT_ORIGINS || [])
  const locale = /^en/i.test(document.documentElement.lang) ? 'en_US' : 'zh_Hans'
  const messages = {
    timeout: { en_US: 'Request timed out. Refresh to check whether it was saved.', zh_Hans: '请求超时，请刷新检查是否已保存。' },
    failed: { en_US: 'Operation failed', zh_Hans: '操作未完成' },
    notReady: { en_US: 'Waiting for a trusted host', zh_Hans: '正在等待可信宿主连接' }
  }
  const text = key => messages[key][locale]
  let origin = null, instanceId = null, sequence = 0
  const pending = new Map()
  try {
    const referrerOrigin = new URL(document.referrer).origin
    if (origins.has(referrerOrigin)) origin = referrerOrigin
  } catch {}

  function request(type, body) {
    if (!origin || !instanceId) return Promise.reject(new Error(text('notReady')))
    const requestId = String(++sequence)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(text('timeout'))) }, 150000)
      pending.set(requestId, { resolve, reject, timeout })
      parent.postMessage({ ...body, channel, protocolVersion: 1, instanceId, type, requestId }, origin)
    })
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || !origins.has(event.origin)) return
    const message = event.data
    if (!message || message.channel !== channel || message.protocolVersion !== 1) return
    if (message.type === 'init') {
      if (typeof message.instanceId !== 'string' || !message.instanceId) return
      if (instanceId && (instanceId !== message.instanceId || origin !== event.origin)) return
      origin = event.origin
      instanceId = message.instanceId
      window.__geoReady && window.__geoReady()
      return
    }
    if (event.origin !== origin || message.instanceId !== instanceId || !pending.has(message.requestId)) return
    if (!['response', 'data', 'actionResult', 'result', 'error'].includes(message.type)) return
    const item = pending.get(message.requestId)
    pending.delete(message.requestId)
    clearTimeout(item.timeout)
    message.type === 'error' ? item.reject(new Error(typeof message.message === 'string' ? message.message : text('failed'))) : item.resolve(message)
  })
  window.addEventListener('pagehide', () => {
    for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error(text('failed'))) }
    pending.clear()
  })
  window.GeoBridge = {
    request, ready: () => !!instanceId,
    async action(actionKey, input) {
      const reply = await request('executeAction', { actionKey, input })
      const result = reply.data || reply.result || reply.payload || {}
      if (result.success === false) throw new Error(typeof result.message === 'string' ? result.message : result.message?.[locale] || text('failed'))
      return result.data
    },
    announce() {
      for (const target of origins) parent.postMessage({ channel, protocolVersion: 1, type: 'ready' }, target)
    }
  }
})()
