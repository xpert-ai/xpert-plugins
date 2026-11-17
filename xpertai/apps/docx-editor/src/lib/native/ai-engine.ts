import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Worker } from 'node:worker_threads'
import type { EngineInput, EngineOutput } from './ai-schema.js'

/** Bounded CPU/DOM work off the API thread; never queue unlimited uploaded presentations. */
@Injectable()
export class DocxEngine {
  private active = 0
  async run(input: EngineInput): Promise<EngineOutput> {
    if (this.active >= 2) throw new ServiceUnavailableException('docx.processing_busy')
    this.active++
    try {
      return await new Promise<EngineOutput>((resolve, reject) => {
        const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: input,
          resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 32 } })
        let done = false
        const finish = (error?: Error, result?: EngineOutput) => {
          if (done) return
          done = true
          clearTimeout(timer)
          void worker.terminate().finally(() => error ? reject(error) : resolve(result!))
        }
        const timer = setTimeout(() => finish(new ServiceUnavailableException('docx.processing_timeout')), 30000)
        worker.once('message', (value: { error?: string; result?: EngineOutput }) => value.result
          ? finish(undefined, value.result) : finish(new BadRequestException(value.error ?? 'docx.processing_failed')))
        worker.once('error', () => finish(new BadRequestException('docx.processing_failed')))
        worker.once('exit', () => { if (!done) finish(new BadRequestException('docx.processing_failed')) })
      })
    } finally { this.active-- }
  }
}
