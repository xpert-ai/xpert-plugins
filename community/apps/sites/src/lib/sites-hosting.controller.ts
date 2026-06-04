import { Controller, Get, Header, Param } from '@nestjs/common'
import { SitesService } from './sites.service.js'
import { Public } from './decorators/public.decorator.js'

@Public()
@Controller('xpert-sites')
export class SitesHostingController {
  constructor(private readonly service: SitesService) {}

  @Public()
  @Get(':deploymentIdOrSlug')
  @Header('content-type', 'text/html; charset=utf-8')
  async getDeployment(@Param('deploymentIdOrSlug') deploymentIdOrSlug: string) {
    const site = await this.service.findDeploymentSite(deploymentIdOrSlug)
    return site.html
  }
}
