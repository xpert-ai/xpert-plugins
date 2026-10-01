import { Logger } from '@nestjs/common'

const logger = new Logger('Dockyard')
type Checkpoint = { operation: string; status: 'started' | 'completed' | 'failed'; durationMs?: number }
/** Deliberately accepts no payload/identity fields; detailed tracing is disabled by default. */
export function debug(checkpoint: Checkpoint) {
  if (process.env.DOCKYARD_DEBUG === '1') logger.debug(checkpoint)
}
