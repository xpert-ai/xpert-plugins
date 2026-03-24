import { Injectable } from '@nestjs/common'
import { TIntegrationLarkOptions } from './types.js'

export type TLarkCapabilityMatrix = {
	supportsInboundMessage: boolean
	supportsMentionTrigger: boolean
	supportsCardSend: boolean
	supportsCardAction: boolean
	supportsWebhookCallback: boolean
}

const INTERACTIVE_ACTION_TAGS = new Set([
	'action',
	'button',
	'overflow',
	'date_picker',
	'picker_time',
	'picker_datetime',
	'select_static',
	'select_person',
	'select_user',
	'multi_select_static',
	'multi_select_person',
	'multi_select_user',
	'select_menu',
	'textarea',
	'input',
	'picker',
	'picker_date'
])

@Injectable()
export class LarkCapabilityService {
	resolveConnectionMode(options?: Partial<TIntegrationLarkOptions> | null): 'webhook' | 'long_connection' {
		return options?.connectionMode === 'long_connection' ? 'long_connection' : 'webhook'
	}

	getCapabilities(options?: Partial<TIntegrationLarkOptions> | null): TLarkCapabilityMatrix {
		void options

		return {
			supportsInboundMessage: true,
			supportsMentionTrigger: true,
			supportsCardSend: true,
			supportsCardAction: true,
			supportsWebhookCallback: true
		}
	}

	containsInteractiveAction(payload: unknown): boolean {
		return this.walkPayload(payload)
	}

	assertCardPayloadSupported(
		options: Partial<TIntegrationLarkOptions> | null | undefined,
		payload: unknown,
		operation = 'send Lark card'
	): void {
		void options
		void payload
		void operation
	}

	private walkPayload(value: unknown): boolean {
		if (!value || typeof value !== 'object') {
			return false
		}

		if (Array.isArray(value)) {
			return value.some((item) => this.walkPayload(item))
		}

		const record = value as Record<string, unknown>
		const tag = typeof record.tag === 'string' ? record.tag : null
		if (tag && INTERACTIVE_ACTION_TAGS.has(tag)) {
			return true
		}

		if (Array.isArray(record.actions) && record.actions.length > 0) {
			return true
		}

		return Object.values(record).some((item) => this.walkPayload(item))
	}
}
