import {
  Module,
  type DynamicModule,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Body,
  Inject,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiConsumes,
  ApiBody,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import type { IntegrationQueue } from '../activity-processing/queue.js';
import { ActivitiesService } from './activities.service.js';
@ApiTags('Atividades')
@ApiCookieAuth('coachSession')
@Controller()
class ActivitiesController {
  constructor(
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(ActivitiesService) readonly activities: ActivitiesService,
  ) {}
  @Get('activities')
  @ApiQuery({ name: 'athleteId', required: false })
  @ApiQuery({
    name: 'sport',
    required: false,
    enum: ['running', 'cycling', 'walking', 'swimming', 'other'],
  })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['garmin_mock', 'manual_fit'],
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'YYYY-MM-DD UTC inclusivo',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'YYYY-MM-DD UTC inclusivo',
  })
  async list(@Req() req: Request, @Query() query: unknown) {
    const user = await this.auth.authenticate(req);
    return this.activities.list(user.coachId, query);
  }
  @Get('activities/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const user = await this.auth.authenticate(req);
    return this.activities.get(user.coachId, id);
  }
  @Get('activities/:id/samples')
  async samples(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    return this.activities.series(user.coachId, id, query, 'samples');
  }
  @Get('activities/:id/splits')
  async splits(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    return this.activities.series(user.coachId, id, query, 'splits');
  }
  @Get('athletes/:id/fit-imports')
  async imports(@Req() req: Request, @Param('id') id: string) {
    const user = await this.auth.authenticate(req);
    return this.activities.imports(user.coachId, id);
  }
  @Post('athletes/:id/fit-imports')
  @HttpCode(202)
  @ApiConsumes('application/octet-stream')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({
    name: 'X-Demo-File',
    required: true,
    description: 'true; somente arquivo sintético de teste no demo local',
  })
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary',
      description: 'FIT até 5 MiB; uma sessão; sem retenção do bruto',
    },
  })
  async upload(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    this.auth.verifyMutation(req, user);
    await this.auth.rateLimit(req, `fit:${user.coachId}`, 10);
    return this.activities.upload(
      user.coachId,
      id,
      body,
      req.get('x-demo-file') === 'true',
    );
  }
}
@Module({})
export class ActivitiesModule {
  static register(
    client: PrismaClient,
    config: Config,
    queue?: IntegrationQueue,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: ActivitiesModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [ActivitiesController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: new ActivitiesService(client, config, queue),
        },
      ],
    };
  }
}
