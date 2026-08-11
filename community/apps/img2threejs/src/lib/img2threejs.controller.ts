import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { IMG2THREEJS_ROUTE_PREFIX } from './constants.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import {
  scopeFromRequestContext,
  stripConcurrencyControlFields
} from './img2threejs.service-support.js'

@Controller(IMG2THREEJS_ROUTE_PREFIX)
export class Img2ThreeJsController {
  constructor(private readonly service: Img2ThreeJsService) {}

  @Get(':id/summary')
  async getSummary(@Param('id') id: string) {
    try {
      return stripConcurrencyControlFields(
        await this.service.getStatus(scopeFromRequestContext(), id)
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        throw new NotFoundException('PROJECT_NOT_FOUND')
      }
      throw error
    }
  }

}
