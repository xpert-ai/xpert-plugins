import { Controller, Post, Req, HttpCode, SetMetadata, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import { Automation } from './automation.js'
import { ReviewError } from './domain.js'

// The host AuthGuard uses this metadata for public endpoints. Authentication here is the signed raw GitHub payload.
@Controller('code_review/github')
export class GitHubWebhook {
  constructor(private readonly automation: Automation) {}
  @Post('webhook')
  @HttpCode(202)
  @SetMetadata('isPublic', true)
  async receive(@Req() request: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }) {
    const header = (name: string) => typeof request.headers[name] === 'string' ? request.headers[name] : undefined
    try {
      return await this.automation.receive(request.rawBody, header('x-hub-signature-256'), header('x-github-delivery') ?? '', header('x-github-event') ?? '')
    } catch (error) {
      if (error instanceof ReviewError && error.code === 'invalid_webhook_signature') throw new UnauthorizedException('invalid_webhook_signature')
      if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof ReviewError) throw new BadRequestException(error instanceof ReviewError ? error.code : 'invalid_webhook_payload')
      throw error
    }
  }
}
