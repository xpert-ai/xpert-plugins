// A decision lock covers active-card checks and preparation, including slow card updates.
// Recovery ownership survives a worker failure between updating the card and saving its envelope.
import type { ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'

type Redis = Awaited<ReturnType<ManagedQueueService['getRedis']>>
export interface LarkDispatchLease {
	ensureOwned(): Promise<void>
	getRecoveryOwner(): Promise<string | null>
	setRecoveryOwner(owner: string): Promise<void>
}

export async function withLarkDispatchLock<T>(
	redis: Redis,
	key: string,
	task: (lease: LarkDispatchLease) => Promise<T>
): Promise<T> {
	const token = randomUUID(),
		ttl = 60_000,
		deadline = Date.now() + 35_000
	while ((await redis.set(key, token, 'PX', ttl, 'NX')) !== 'OK') {
		if (Date.now() >= deadline) throw new Error('Timed out waiting for the active Lark response decision')
		await new Promise<void>((resolve) => setTimeout(resolve, 50))
	}
	let lost = false
	let renewing: Promise<void> | undefined
	const ensureOwned = async () => {
		if (
			lost ||
			(await redis.eval(
				"if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end",
				1,
				key,
				token,
				ttl
			)) !== 1
		) {
			lost = true
			throw new Error('Lark dispatch decision lease lost')
		}
	}
	const timer = setInterval(() => {
		if (!renewing)
			renewing = ensureOwned()
				.catch(() => {
					lost = true
				})
				.finally(() => {
					renewing = undefined
				})
	}, ttl / 3)
	try {
		return await task({
			ensureOwned,
			getRecoveryOwner: () => redis.get(`${key}:recovery`),
			setRecoveryOwner: async (owner) => {
				await ensureOwned()
				const result = await redis.eval(
					"if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[2], ARGV[2], 'EX', 86400) return 1",
					2,
					key,
					`${key}:recovery`,
					token,
					owner
				)
				if (result !== 1) throw new Error('Lark dispatch decision lease lost before recovery claim')
			}
		})
	} finally {
		clearInterval(timer)
		await renewing
		await redis.eval(
			"if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
			1,
			key,
			token
		)
	}
}
