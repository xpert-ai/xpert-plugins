import { z } from 'zod/v3'

export const LongTermMemoryIcon = `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 64 64" style="enable-background:new 0 0 64 64;" xml:space="preserve">
<style type="text/css">
	.st0{fill:#C75C5C;}
	.st1{opacity:0.2;fill:#231F20;}
	.st2{fill:#4F5D73;}
	.st3{fill:#E0E0D1;}
	.st4{fill:#F5CF87;}
</style>
<circle class="st0" cx="32" cy="32" r="32"/>
<path class="st1" d="M48,52c0,1.1-0.9,2-2,2H18c-1.1,0-2-0.9-2-2V16c0-1.1,0.9-2,2-2h23c1.1,0,7,5.9,7,7V52z"/>
<path class="st2" d="M48,50c0,1.1-0.9,2-2,2H18c-1.1,0-2-0.9-2-2V14c0-1.1,0.9-2,2-2h23c1.1,0,7,5.9,7,7V50z"/>
<path class="st3" d="M44,46c0,1.1-0.9,2-2,2H22c-1.1,0-2-0.9-2-2V26c0-1.1,0.9-2,2-2h20c1.1,0,2,0.9,2,2V46z"/>
<rect x="20" y="12" class="st4" width="4" height="6"/>
<rect x="26" y="12" class="st4" width="4" height="6"/>
<rect x="32" y="12" class="st4" width="4" height="6"/>
</svg>
`


const memoryConfigSchema = z.object({
  enabled: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  scoreThreshold: z.number().min(0).max(1).optional()
})

export const longTermMemoryMiddlewareOptionsSchema = z.object({
  profile: memoryConfigSchema.optional(),
  qa: memoryConfigSchema.optional(),
  wrapperTag: z.string().min(1).max(64).optional(),
  includeScore: z.boolean().optional(),
  maxChars: z.number().int().min(0).optional(),
  /**
   * Whether to add a hint clarifying that memories are data, not instructions.
   * Helps prevent prompt injection via stored memories.
   */
  instructionHint: z.boolean().optional(),
  /**
   * Custom instruction hint text. If not provided, uses default.
   */
  customHint: z.string().max(500).optional(),
  /**
   * Enable debug logging for memory retrieval stats.
   */
  enableLogging: z.boolean().optional()
})

export type LongTermMemoryMiddlewareOptions = z.infer<typeof longTermMemoryMiddlewareOptionsSchema>
