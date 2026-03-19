import { classifyLongConnectionError } from './lark-long-connection.utils.js'

describe('classifyLongConnectionError', () => {
	it('marks timeout errors as recoverable', () => {
		expect(classifyLongConnectionError(new Error('connect ETIMEDOUT callback/ws/endpoint timeout')).recoverable).toBe(true)
	})

	it('marks credential bootstrap errors as unrecoverable', () => {
		expect(
			classifyLongConnectionError(
				new Error('Failed to acquire tenant_access_token because app id or app secret is invalid')
			).recoverable
		).toBe(false)
	})
})
