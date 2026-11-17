import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Worker } from 'node:worker_threads'
import type { EngineInput, EngineOutput } from './ai-schema.js'
import type { TemplateEngineInput } from './template-schema.js'

/** Bounded CPU/DOM work off the API thread; never queue unlimited uploaded presentations. */
@Injectable()
export class PptxEngine {
  private active = 0
  async run(input: EngineInput | TemplateEngineInput): Promise<EngineOutput> {
    if (this.active >= 2) throw new ServiceUnavailableException('pptx.processing_busy')
    this.active++
    try {
      return await new Promise<EngineOutput>((resolve, reject) => {
        const worker = new Worker(new URL('./pptx-worker.mjs', import.meta.url), { workerData: input,
          resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 32 } })
        let done = false
        const finish = (error?: Error, result?: EngineOutput) => {
          if (done) return
          done = true
          clearTimeout(timer)
          void worker.terminate().finally(() => error ? reject(error) : resolve(result!))
        }
        const timer = setTimeout(() => finish(new ServiceUnavailableException('pptx.processing_timeout')), 30000)
        worker.once('message', (value: { error?: string; result?: EngineOutput }) => value.result
          ? finish(undefined, value.result) : finish(new BadRequestException(value.error ?? 'pptx.processing_failed')))
        worker.once('error', () => finish(new BadRequestException('pptx.processing_failed')))
        worker.once('exit', () => { if (!done) finish(new BadRequestException('pptx.processing_failed')) })
      })
    } finally { this.active-- }
  }
}
