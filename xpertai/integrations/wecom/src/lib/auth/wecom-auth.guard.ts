import { Injectable } from '@nestjs/common'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

@Injectable()
export class WeComAuthGuard extends PassportAuthGaurd(['wecom-token']) {}
