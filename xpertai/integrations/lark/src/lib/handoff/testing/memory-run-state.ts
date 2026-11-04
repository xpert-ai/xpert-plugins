import { LarkChatRunStateService, type LarkChatRunState, type LarkRunLease } from '../lark-chat-run-state.service.js'
import type { LarkChatCallbackContext } from '../lark-chat.types.js'
import type { Cache } from 'cache-manager'
import type { PluginContext } from '@xpert-ai/plugin-sdk'

/** Renderer fixture only; concurrency/fencing is verified against Redis in child processes. */
export class MemoryRunStateService extends LarkChatRunStateService {
	readonly states = new Map<string, LarkChatRunState>()
	private readonly done = new Set<string>()
	private tail = Promise.resolve()
	constructor() {
		super({} as Cache, {} as PluginContext)
	}
	async get(id: string) {
		return this.states.get(id) ?? null
	}
	async save(state: LarkChatRunState) {
		this.states.set(state.sourceMessageId, structuredClone(state))
	}
	override async withRun<T>(
		id: string,
		_context: LarkChatCallbackContext,
		callback: (lease: LarkRunLease) => Promise<T>
	): Promise<T> {
		const previous = this.tail
		let release: () => void
		this.tail = new Promise<void>((resolve) => {
			release = resolve
		})
		await previous
		try {
			return await callback({
				state: structuredClone(this.states.get(id) ?? null),
				completed: this.done.has(id),
				ensureOwned: async () => {},
				save: (state) => this.save(state),
				finish: async () => {
					this.states.delete(id)
					this.done.add(id)
				}
			})
		} finally {
			release()
		}
	}
}
