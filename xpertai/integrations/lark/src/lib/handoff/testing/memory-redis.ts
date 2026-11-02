/** Minimal lease fixture for unit tests. Real Lua and expiration use Redis integration tests. */
export class MemoryRedis {
	readonly values = new Map<string, string>()
	async get(key: string) {
		return this.values.get(key) ?? null
	}
	async set(key: string, value: string, ...options: unknown[]) {
		if (options.includes('NX') && this.values.has(key)) return null
		this.values.set(key, value)
		return 'OK'
	}
	async eval(script: string, count: number, ...args: Array<string | number>) {
		const keys = args.slice(0, count).map(String),
			values = args.slice(count).map(String)
		if (this.values.get(keys[0]) !== values[0]) return 0
		if (count === 3) {
			this.values.set(keys[1], '1')
			this.values.delete(keys[2])
		} else if (count === 2) this.values.set(keys[1], values[1])
		else if (script.includes("'del'")) this.values.delete(keys[0])
		return 1
	}
}
