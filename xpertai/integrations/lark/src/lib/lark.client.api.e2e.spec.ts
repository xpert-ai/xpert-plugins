import * as lark from '@larksuiteoapi/node-sdk'
import { existsSync } from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'

type TDepartmentIdType = 'department_id' | 'open_department_id'
type TUserIdType = 'user_id' | 'union_id' | 'open_id'

const envPathCandidates = Array.from(
	new Set(
		[
			process.env.INTEGRATION_LARK_CLIENT_E2E_ENV_PATH,
			process.env.INTEGRATION_LARK_E2E_ENV_PATH,
			path.resolve(process.cwd(), '.env.e2e.local'),
			path.resolve(process.cwd(), 'integrations/lark/.env.e2e.local'),
			path.resolve(process.cwd(), 'packages/plugins/integration-lark/.env.e2e.local'),
			path.resolve(process.cwd(), '.env')
		].filter((candidate): candidate is string => Boolean(candidate))
	)
)

const resolvedEnvPath =
	envPathCandidates.find((candidate) => existsSync(candidate)) ?? path.resolve(process.cwd(), '.env')
console.log(`Using environment variables from: ${resolvedEnvPath}`)
dotenv.config({ path: resolvedEnvPath })

const e2eEnabled = process.env.INTEGRATION_LARK_CLIENT_E2E_ENABLED === 'true'
const describeWithE2E = e2eEnabled ? describe : describe.skip

const e2eTimeoutMs = parsePositiveInt(
	process.env.INTEGRATION_LARK_CLIENT_E2E_TIMEOUT_MS ??
		process.env.INTEGRATION_LARK_E2E_TIMEOUT_MS,
	30000,
	120000
)
const enableDepartmentChildren = parseBoolean(
	process.env.INTEGRATION_LARK_CLIENT_E2E_ENABLE_DEPARTMENT_CHILDREN,
	true
)
const enableUserFindByDepartment = parseBoolean(
	process.env.INTEGRATION_LARK_CLIENT_E2E_ENABLE_USER_FIND_BY_DEPARTMENT,
	true
)
const enableChatList = parseBoolean(process.env.INTEGRATION_LARK_CLIENT_E2E_ENABLE_CHAT_LIST, true)

describeWithE2E('Lark SDK API (real e2e)', () => {
	let client: lark.Client
	let defaultDepartmentId = '0'
	let departmentIdType: TDepartmentIdType = 'open_department_id'

	beforeAll(() => {
		const appId = readRequiredEnv('INTEGRATION_LARK_CLIENT_APP_ID', 'LARK_APP_ID')
		const appSecret = readRequiredEnv('INTEGRATION_LARK_CLIENT_APP_SECRET', 'LARK_APP_SECRET')
		const isLark = parseBoolean(
			readFirstNonEmptyEnv('INTEGRATION_LARK_CLIENT_IS_LARK', 'LARK_IS_LARK'),
			false
		)

		defaultDepartmentId = readFirstNonEmptyEnv('INTEGRATION_LARK_CLIENT_DEPARTMENT_ID') ?? '0'
		departmentIdType = parseDepartmentIdType(
			readFirstNonEmptyEnv('INTEGRATION_LARK_CLIENT_DEPARTMENT_ID_TYPE')
		)
		client = new lark.Client({
			appId,
			appSecret,
			appType: lark.AppType.SelfBuild,
			domain: isLark ? lark.Domain.Lark : lark.Domain.Feishu,
			loggerLevel: lark.LoggerLevel.warn
		})
	}, e2eTimeoutMs)

	const runDepartmentChildren = enableDepartmentChildren ? it : it.skip
	runDepartmentChildren(
		'should call client.contact.v3.department.children and validate input/output shape',
		async () => {
			const requestPayload = {
				path: {
					department_id: defaultDepartmentId
				},
				params: {
					department_id_type: departmentIdType,
					fetch_child: parseBoolean(process.env.INTEGRATION_LARK_CLIENT_FETCH_CHILD, true),
					page_size: parsePositiveInt(
						process.env.INTEGRATION_LARK_CLIENT_DEPARTMENT_PAGE_SIZE,
						50,
						50
					),
					page_token: undefined
				}
			}

			const response = await callApi('contact.v3.department.children', requestPayload, () =>
				client.contact.v3.department.children(requestPayload)
			)
			expectSuccessCode('contact.v3.department.children', response)

			const items = response.data?.items ?? []
			expect(Array.isArray(items)).toBe(true)
			for (const item of items.slice(0, 3)) {
				expect(item.name).toBeTruthy()
				expect(item.parent_department_id).toBeDefined()
				expect(item.open_department_id || item.department_id).toBeTruthy()
			}
		},
		e2eTimeoutMs
	)

	const runUserFindByDepartment = enableUserFindByDepartment ? it : it.skip
	runUserFindByDepartment(
		'should call client.contact.v3.user.findByDepartment and validate input/output shape',
		async () => {
			const requestPayload = {
				params: {
					user_id_type: parseUserIdType(
						readFirstNonEmptyEnv('INTEGRATION_LARK_CLIENT_USER_ID_TYPE')
					),
					department_id_type: departmentIdType,
					department_id:
						readFirstNonEmptyEnv('INTEGRATION_LARK_CLIENT_USER_DEPARTMENT_ID') ??
						defaultDepartmentId,
					page_size: parsePositiveInt(
						process.env.INTEGRATION_LARK_CLIENT_USER_PAGE_SIZE,
						50,
						50
					),
					page_token: undefined
				}
			}

			const response = await callApi('contact.v3.user.findByDepartment', requestPayload, () =>
				client.contact.v3.user.findByDepartment(requestPayload)
			)
			expectSuccessCode('contact.v3.user.findByDepartment', response)

			const items = response.data?.items ?? []
			expect(Array.isArray(items)).toBe(true)
			for (const item of items.slice(0, 3)) {
				expect(item.open_id || item.user_id || item.union_id).toBeTruthy()
				expect(item.name || item.email || item.mobile).toBeTruthy()
			}
		},
		e2eTimeoutMs
	)

	const runChatList = enableChatList ? it : it.skip
	runChatList(
		'should call client.im.chat.list and validate output shape',
		async () => {
			const includeParams = parseBoolean(
				process.env.INTEGRATION_LARK_CLIENT_CHAT_LIST_WITH_PARAMS,
				false
			)
			const requestPayload = includeParams
				? {
						params: {
							page_size: parsePositiveInt(
								process.env.INTEGRATION_LARK_CLIENT_CHAT_PAGE_SIZE,
								20,
								50
							)
						}
				  }
				: undefined

			const response = await callApi('im.chat.list', requestPayload, () =>
				requestPayload ? client.im.chat.list(requestPayload) : client.im.chat.list()
			)
			expectSuccessCode('im.chat.list', response)

			const items = response.data?.items ?? []
			expect(Array.isArray(items)).toBe(true)
			for (const item of items.slice(0, 3)) {
				expect(item.chat_id).toBeTruthy()
				expect(item.name).toBeDefined()
			}
		},
		e2eTimeoutMs
	)
})

function parseDepartmentIdType(value: string | undefined): TDepartmentIdType {
	return value === 'department_id' ? 'department_id' : 'open_department_id'
}

function parseUserIdType(value: string | undefined): TUserIdType {
	if (value === 'user_id' || value === 'union_id' || value === 'open_id') {
		return value
	}
	return 'open_id'
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	const normalized = value?.trim().toLowerCase()
	if (!normalized) {
		return defaultValue
	}
	if (normalized === 'true') {
		return true
	}
	if (normalized === 'false') {
		return false
	}
	return defaultValue
}

function parsePositiveInt(value: string | undefined, defaultValue: number, max: number): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return defaultValue
	}
	return Math.min(Math.floor(parsed), max)
}

function readFirstNonEmptyEnv(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name]?.trim()
		if (value) {
			return value
		}
	}
	return undefined
}

function readRequiredEnv(primaryName: string, ...fallbackNames: string[]): string {
	const value = readFirstNonEmptyEnv(primaryName, ...fallbackNames)
	if (!value) {
		throw new Error(
			`Missing required env: ${primaryName}${fallbackNames.length ? ` (fallbacks: ${fallbackNames.join(', ')})` : ''}`
		)
	}
	return value
}

function expectSuccessCode(apiName: string, response: { code?: number; msg?: string }) {
	expect(typeof response.code).toBe('number')
	expect(response.code).toBe(0)
	if (response.code !== 0) {
		throw new Error(`[${apiName}] failed with code=${response.code}, msg=${response.msg}`)
	}
}

async function callApi<T>(
	apiName: string,
	requestPayload: unknown,
	call: () => Promise<T>
): Promise<T> {
	try {
		const response = (await call()) as any
		console.log(
			`[${apiName}] input=${JSON.stringify(requestPayload)} output=${JSON.stringify({
				code: response?.code,
				msg: response?.msg,
				hasMore: response?.data?.has_more,
				pageToken: response?.data?.page_token,
				itemCount: Array.isArray(response?.data?.items) ? response.data.items.length : undefined
			})}`
		)
		console.log(response?.data?.items)
		return response
	} catch (error: any) {
		console.error(`[${apiName}] failed with input=${JSON.stringify(requestPayload)}`)
		console.error(error?.response?.data || error)
		throw error
	}
}
