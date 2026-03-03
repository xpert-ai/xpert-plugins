import {
	parseErrorFromJsonString,
	stringifyErrorAsJson,
	toLarkApiErrorMessage,
	toNonEmptyString
} from './utils.js'

describe('lark utils', () => {
	let consoleErrorSpy: jest.SpyInstance

	beforeEach(() => {
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
	})

	describe('toNonEmptyString', () => {
		it('returns null for non-string values', () => {
			expect(toNonEmptyString(undefined)).toBeNull()
			expect(toNonEmptyString(123)).toBeNull()
			expect(toNonEmptyString({})).toBeNull()
		})

		it('trims and returns a valid string', () => {
			expect(toNonEmptyString('  hello  ')).toBe('hello')
			expect(toNonEmptyString('   ')).toBeNull()
		})
	})

	describe('stringifyErrorAsJson', () => {
		it('stringifies Error instances with message', () => {
			const raw = stringifyErrorAsJson(new Error('boom'))
			expect(raw).toContain('"message":"boom"')
			expect(raw).toContain('"name":"Error"')
		})

		it('handles circular objects safely', () => {
			const circular: Record<string, unknown> = { a: 1 }
			circular.self = circular

			const raw = stringifyErrorAsJson(circular)
			expect(raw).toContain('"self":"[Circular]"')
		})
	})

	describe('parseErrorFromJsonString', () => {
		it('parses valid json string', () => {
			const value = parseErrorFromJsonString('{"code":999,"msg":"failed"}')
			expect(value).toEqual({ code: 999, msg: 'failed' })
		})

		it('parses nested json string payload', () => {
			const nested = JSON.stringify('{"code":1002,"msg":"nested"}')
			const value = parseErrorFromJsonString(nested)
			expect(value).toEqual({ code: 1002, msg: 'nested' })
		})

		it('extracts json from prefixed log line', () => {
			const raw = '[Lark API Error] {"code":1002,"msg":"from-log"}'
			const value = parseErrorFromJsonString(raw)
			expect(value).toEqual({ code: 1002, msg: 'from-log' })
		})

		it('returns original value when json is invalid', () => {
			const raw = 'not-a-json'
			expect(parseErrorFromJsonString(raw)).toBe(raw)
		})
	})

	describe('toLarkApiErrorMessage', () => {
		it('formats field violations and log id', () => {
			const error = {
				response: {
					data: {
						code: 1002,
						msg: 'Invalid department request',
						error: {
							message: 'Invalid department request',
							log_id: 'log-001',
							troubleshooter: 'https://open.feishu.cn/document/uAjLw4CM',
							field_violations: [
								{ field: 'department_id', message: 'is invalid' },
								{ field: 'name', reason: 'required' }
							]
						}
					}
				}
			}

			const message = toLarkApiErrorMessage(error)
			expect(message).toBe(
				'Invalid department request | field_violations: department_id: is invalid; name: required | log_id: log-001 | troubleshooter: https://open.feishu.cn/document/uAjLw4CM'
			)
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"Invalid department request"'))
		})

		it('falls back to plain message for generic Error', () => {
			const message = toLarkApiErrorMessage(new Error('network timeout'))
			expect(message).toBe('network timeout')
		})

		it('supports replaying captured error json string fixture', () => {
			const capturedErrorJson = JSON.stringify({
				code: 1002,
					msg: 'Permission denied',
					error: {
						message: 'Permission denied',
						log_id: 'log-from-capture',
						troubleshooter: 'https://open.feishu.cn/document/uAjLw4CM/case',
						field_violations: [{ field: 'tenant_id', message: 'missing' }]
					}
				})
			const parsedError = parseErrorFromJsonString(capturedErrorJson)

			const message = toLarkApiErrorMessage(parsedError)
			expect(message).toContain('Permission denied')
			expect(message).toContain('tenant_id: missing')
			expect(message).toContain('log_id: log-from-capture')
			expect(message).toContain('troubleshooter: https://open.feishu.cn/document/uAjLw4CM/case')
		})
	})
})
