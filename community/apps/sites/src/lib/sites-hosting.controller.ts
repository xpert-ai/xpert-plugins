import { Controller, Get, Header, Param, Query } from '@nestjs/common'
import { SitesService } from './sites.service.js'
import { Public } from './decorators/public.decorator.js'

@Controller('xpert-sites')
export class SitesHostingController {
  constructor(private readonly service: SitesService) {}

  @Public()
  @Get('preview/:deploymentIdOrSlug')
  @Header('content-type', 'text/html; charset=utf-8')
  async getDeploymentPreview(
    @Param('deploymentIdOrSlug') deploymentIdOrSlug: string,
    @Query('xpert_sites_preview') previewToken?: string
  ) {
    const site = await this.service.findDeploymentSite(deploymentIdOrSlug, { previewToken })
    return site.html
  }

  @Get(':deploymentIdOrSlug')
  @Header('content-type', 'text/html; charset=utf-8')
  async getDeployment(@Param('deploymentIdOrSlug') deploymentIdOrSlug: string) {
    const site = await this.service.findDeploymentSite(deploymentIdOrSlug)
    return site.html
  }
}
