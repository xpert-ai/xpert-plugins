import type { QueueOptions } from 'bullmq'

export function getWechatPersonalBullMqConnection(): QueueOptions['connection'] {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    try {
      const url = new URL(redisUrl)
      const port = Number(url.port)
      const connection: Record<string, unknown> = {
        host: url.hostname || 'localhost',
        port: Number.isNaN(port) || !port ? 6379 : port
      }
      if (url.username) {
        connection.username = decodeURIComponent(url.username)
      }
      if (url.password) {
        connection.password = decodeURIComponent(url.password)
      }
      if (url.protocol === 'rediss:') {
        connection.tls = {}
      }
      return connection as QueueOptions['connection']
    } catch {
      return redisUrl as unknown as QueueOptions['connection']
    }
  }

  const host = process.env.REDIS_HOST || 'localhost'
  const portRaw = process.env.REDIS_PORT || 6379
  const username = process.env['REDIS.USERNAME'] || process.env.REDIS_USER || process.env.REDIS_USERNAME || undefined
  const password = process.env.REDIS_PASSWORD || undefined
  const port = Number(portRaw)
  const connection: Record<string, unknown> = {
    host,
    port: Number.isNaN(port) ? 6379 : port
  }
  if (username) {
    connection.username = username
  }
  if (password) {
    connection.password = password
  }
  if (process.env.REDIS_TLS === 'true') {
    connection.tls = {
      host,
      port: Number.isNaN(port) ? 6379 : port
    }
  }
  return connection as QueueOptions['connection']
}
