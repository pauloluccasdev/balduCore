import {
  Controller,
  Get,
  Inject,
  Module,
  Query,
  Req,
  type DynamicModule,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { DashboardService } from './dashboard.service.js';
@ApiTags('Dashboard')
@ApiCookieAuth('coachSession')
@Controller('dashboard')
class DashboardController {
  constructor(
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(DashboardService) readonly service: DashboardService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'Snapshot consolidado autorizado; cadastros/conexões atuais, atividades por início UTC e pendências por atualização; GET sem efeitos colaterais',
  })
  @ApiQuery({ name: 'period', enum: [7, 30, 90], required: false })
  @ApiQuery({
    name: 'sport',
    enum: ['running', 'cycling', 'swimming', 'walking', 'other'],
    required: false,
  })
  async get(@Req() req: Request, @Query() query: unknown) {
    const user = await this.auth.authenticate(req);
    await this.auth.rateLimit(req, `dashboard-read:${user.coachId}`, 60);
    return this.service.get(user.coachId, query);
  }
}
@Module({})
export class DashboardModule {
  static register(
    client: PrismaClient,
    config: Config,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: DashboardModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: new DashboardService(client) },
      ],
    };
  }
}
