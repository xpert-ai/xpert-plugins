jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	const mock = createLarkPluginSdkMock(jest, {
		AgentMiddlewareStrategy: () => (target: unknown) => target,
		WorkspaceFilesRuntimeCapability: Symbol('WorkspaceFilesRuntimeCapability'),
		XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES_TOKEN'
	})
	mock.RequestContext.currentTenantId.mockReturnValue('tenant-fallback')
	mock.RequestContext.getOrganizationId.mockReturnValue('org-fallback')
	return mock
})

import { LarkLocalHistoryMiddleware } from './lark-local-history.middleware.js'

describe('LarkLocalHistoryMiddleware', () => {
	it('uses only runtime-injected scope and returns at most ten workspace artifacts', async () => {
		const files = Array.from({ length: 12 }, (_, index) => ({
			id: `file-${index}`,
			originalName: `file-${index}.txt`,
			workspacePath: `files/file-${index}.txt`,
			mimeType: 'text/plain'
		}))
		const historyService = {
			searchChatHistory: jest.fn().mockResolvedValue({
				items: [{ id: 'history-1', content: 'matched history' }],
				totalScanned: 1,
				hasMore: true,
				nextCursor: 'next-page-cursor',
				files
			})
		}
		const middleware = new LarkLocalHistoryMiddleware(historyService as any).createMiddleware(
			{},
			{ xpertId: 'context-xpert' } as any
		) as any
		const searchTool = middleware.tools[0]

		const response = await searchTool.invoke(
			{
				name: 'lark_search_chat_history',
				args: { keyword: 'matched', includeFiles: true, cursor: 'current-page-cursor' },
				id: 'tool-call-1',
				type: 'tool_call'
			},
			{
			configurable: {
				runtimePrincipal: {
					sourceIntegrationId: 'integration-1'
				},
				context: {
						scopeKey: 'group:chat-1',
						xpertId: 'xpert-1',
						tenantId: 'tenant-1',
						organizationId: 'org-1',
						currentInboundLogIds: ['current-log']
					}
				}
			}
		)

		expect(historyService.searchChatHistory).toHaveBeenCalledWith({
			integrationId: 'integration-1',
			scopeKey: 'group:chat-1',
			xpertId: 'xpert-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			keyword: 'matched',
			direction: undefined,
			before: undefined,
			after: undefined,
			cursor: 'current-page-cursor',
			limit: undefined,
			includeFiles: true,
			hasAttachments: undefined,
			excludedLogIds: ['current-log'],
			respectContextReset: false
		})
		expect(response.artifact.files).toHaveLength(10)
		expect(response.content).toContain('next-page-cursor')
		expect(searchTool.schema.keyof().options).not.toContain('integrationId')
		expect(searchTool.schema.keyof().options).not.toContain('scopeKey')
	})

	it('rejects calls without a runtime-injected Lark conversation scope', async () => {
		const historyService = { searchChatHistory: jest.fn() }
		const middleware = new LarkLocalHistoryMiddleware(historyService as any).createMiddleware(
			{},
			{ xpertId: 'xpert-1' } as any
		) as any

		await expect(middleware.tools[0].invoke({}, {})).rejects.toThrow(
			'only available inside a captured Lark conversation'
		)
		expect(historyService.searchChatHistory).not.toHaveBeenCalled()
	})
})
