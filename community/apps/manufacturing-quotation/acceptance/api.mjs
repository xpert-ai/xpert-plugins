import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

assert.equal(process.env.MANUFACTURING_ACCEPTANCE_ISOLATED === '1', true,
  'Set MANUFACTURING_ACCEPTANCE_ISOLATED=1 only for your isolated Xpert test environment')

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function requiredEnv(name) {
  const value = process.env[name]
  assert.ok(value?.trim(), `Set ${name} in the process environment`)
  return value
}

function idEnv(name) {
  const value = requiredEnv(name).trim()
  assert.ok(uuid.test(value), `${name} must be a UUID`)
  return value
}

function localOrigin(name, fallback) {
  const url = URL.parse(process.env[name] || fallback)
  assert.ok(url && ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash,
    `${name} must be a loopback HTTP(S) origin`)
  return url.origin
}

export const origin = localOrigin('XPERT_API_URL', 'http://127.0.0.1:3000')
export const webOrigin = localOrigin('XPERT_WEB_URL', 'http://localhost:4200')
export const assistantId = idEnv('MANUFACTURING_ASSISTANT_ID')
export const receipt = { tenant: { id: idEnv('XPERT_TENANT_ID') }, organization: { id: idEnv('XPERT_ORG_ID') } }
export const credentials = { email: requiredEnv('XPERT_TEST_ADMIN_EMAIL'), password: requiredEnv('XPERT_TEST_ADMIN_PASSWORD') }
export const output = new URL('./.local/', import.meta.url)
export const view = 'manufacturing_quotation.view-provider__manufacturing_quotation.workbench'

export async function client(token, path, { method = 'GET', body, scope = 'organization', headers = {} } = {}) {
  assert.ok(path.startsWith('/'), 'API path must start with /')
  const form = body instanceof FormData
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'tenant-id': receipt.tenant.id,
      'x-scope-level': scope,
      ...(scope === 'organization' ? { 'organization-id': receipt.organization.id } : {}),
      ...headers,
    },
    body: body === undefined || form ? body : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  return { status: response.status, ok: response.ok, data, text }
}

let adminLogin

async function loginAsAdmin() {
  const login = await client(null, '/auth/login', { method: 'POST', body: credentials, scope: 'tenant' })
  assert.ok(login.ok, `Test administrator login failed (HTTP ${login.status})`)
  assert.ok(login.data?.token && login.data.user?.role?.name === 'SUPER_ADMIN', 'A test SUPER_ADMIN login is required')
  return login.data.token
}

export async function request(path, options = {}) {
  adminLogin ??= loginAsAdmin()
  const result = await client(await adminLogin, path, options)
  if (!result.ok) {
    const error = new Error(`Platform ${options.method ?? 'GET'} ${path}: HTTP ${result.status}`)
    error.status = result.status
    throw error
  }
  return options.raw ? result.text : result.data
}

export async function saveLocal(name, data) {
  await mkdir(output, { recursive: true })
  await writeFile(new URL(name, output), JSON.stringify(data, null, 2) + '\n')
}
