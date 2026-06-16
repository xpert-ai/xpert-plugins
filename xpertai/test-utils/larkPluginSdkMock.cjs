function createLarkPluginSdkMock(jestRef, overrides = {}) {
	class CancelConversationCommand {
		constructor(input) {
			this.input = input
		}
	}

	return {
		__esModule: true,
		CHAT_CHANNEL_TEXT_LIMITS: { lark: 1000 },
		ChatChannel: () => (target) => target,
		CancelConversationCommand,
		defineChannelMessageType: (channel, type, version) =>
			`channel.${channel}.${type}.v${version}`,
		WorkflowTriggerStrategy: () => (target) => target,
		INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
		USER_PERMISSION_SERVICE_TOKEN: 'USER_PERMISSION_SERVICE_TOKEN',
		RequestContext: {
			currentUser: jestRef.fn(),
			currentTenantId: jestRef.fn(),
			currentUserId: jestRef.fn(),
			getOrganizationId: jestRef.fn(),
			getLanguageCode: jestRef.fn(),
			currentRequest: jestRef.fn()
		},
		getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
		runWithRequestContext: (_req, _res, next) => next(),
		...overrides
	}
}

module.exports = {
	createLarkPluginSdkMock
}
