import { Injectable, Logger } from '@nestjs/common'
import { PresentationConfigService } from './presentation-config.service.js'

type DebugValue = string | number | boolean | null | undefined
type DebugData = Record<string, DebugValue>

@Injectable()
export class PresentationDebugService {
  private readonly logger = new Logger('PresentationStudio')
  constructor(private readonly config: PresentationConfigService) {}

  info(event: string, data: DebugData = {}) {
    if (this.config.get().debug) this.logger.log(`${event} ${JSON.stringify(redact(data))}`)
  }

  error(event: string, data: DebugData = {}) {
    this.logger.error(`${event} ${JSON.stringify(redact(data))}`)
  }
}

function redact(data: DebugData): DebugData {
  const output: DebugData = {}
  for (const [key, value] of Object.entries(data)) {
    output[key] = /token|session|tenant|organization|base64|html/i.test(key)
      ? '[redacted]'
      : typeof value === 'string' && value.length > 180 ? `${value.slice(0, 180)}…` : value
  }
  return output
}
