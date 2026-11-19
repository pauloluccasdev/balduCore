import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Query,
  Req,
  type DynamicModule,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { MonitoringService } from './monitoring.service.js';
import { kinds } from './projection.js';
@ApiTags('Central de Monitoramento')
@ApiCookieAuth('coachSession')
@Controller('monitoring')
class MonitoringController {
  constructor(
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(MonitoringService) readonly service: MonitoringService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'Itens e contadores no mesmo escopo autorizado; GET não reconcilia ou marca leitura',
  })
  @ApiQuery({ name: 'type', enum: kinds, required: false })
  @ApiQuery({ name: 'athleteId', type: String, required: false })
  @ApiQuery({
    name: 'from',
    description: 'YYYY-MM-DD UTC, inclusivo',
    required: false,
  })
  @ApiQuery({
    name: 'to',
    description: 'YYYY-MM-DD UTC, inclusivo; até 90 dias, padrão últimos 30',
    required: false,
  })
  @ApiQuery({ name: 'read', enum: ['all', 'read', 'unread'], required: false })
  @ApiQuery({
    name: 'state',
    enum: ['all', 'active', 'resolved'],
    required: false,
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  async list(@Req() req: Request, @Query() query: unknown) {
    const user = await this.auth.authenticate(req);
    await this.auth.rateLimit(req, `monitoring-read:${user.coachId}`, 120);
    return this.service.list(user.coachId, query);
  }
  @Get('athletes')
  @ApiOperation({
    summary:
      'Busca limitada a 20 alunos com itens autorizados, para o filtro da central',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'selected', required: false, type: String })
  async athletes(@Req() req: Request, @Query() query: unknown) {
    const user = await this.auth.authenticate(req);
    await this.auth.rateLimit(req, `monitoring-read:${user.coachId}`, 120);
    return this.service.athletes(user.coachId, query);
  }
  @Patch(':id/read')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['expectedVersion', 'read'],
      properties: {
        expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483647 },
        read: { type: 'boolean' },
      },
    },
  })
  async mark(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    this.auth.verifyMutation(req, user);
    await this.auth.rateLimit(req, `monitoring-write:${user.coachId}`, 60);
    return this.service.mark(user.coachId, id, body);
  }
}
@Module({})
export class MonitoringModule {
  static register(
    client: PrismaClient,
    config: Config,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: MonitoringModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [MonitoringController],
      providers: [
        { provide: MonitoringService, useValue: new MonitoringService(client) },
      ],
    };
  }
}
