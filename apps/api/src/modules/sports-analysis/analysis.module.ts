import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Query,
  Body,
  Inject,
  HttpCode,
  type DynamicModule,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiHeader,
  ApiBody,
  ApiQuery,
  ApiOperation,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import type { IntegrationQueue } from '../activity-processing/queue.js';
import { AnalysisService } from './analysis.service.js';
@ApiTags('Análise esportiva')
@ApiCookieAuth('coachSession')
@Controller('activities/:id/analysis')
class AnalysisController {
  constructor(
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(AnalysisService) readonly analysis: AnalysisService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'Consulta consistente da revisão, análise, séries reduzidas e splits; GET não enfileira trabalho',
  })
  @ApiQuery({ name: 'axis', required: false, enum: ['time', 'distance'] })
  @ApiQuery({
    name: 'eventPage',
    required: false,
    type: Number,
    description: 'Até 50 eventos por página',
  })
  @ApiQuery({
    name: 'splitPage',
    required: false,
    type: Number,
    description: 'Até 100 splits por página',
  })
  async get(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    await this.auth.rateLimit(req, `analysis-read:${user.coachId}`, 120);
    return this.analysis.get(user.coachId, id, query);
  }
  @Post()
  @HttpCode(202)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  async request(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    this.auth.verifyMutation(req, user);
    await this.auth.rateLimit(req, `analysis-write:${user.coachId}`, 20);
    return this.analysis.request(user.coachId, id, body);
  }
  @Post('compare')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['inputRevision', 'inputHash', 'segments'],
      properties: {
        inputRevision: { type: 'integer', minimum: 1 },
        inputHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        segments: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'from', 'to'],
            properties: {
              kind: { type: 'string', enum: ['time', 'distance', 'splits'] },
              from: { type: 'number' },
              to: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async compare(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    this.auth.verifyMutation(req, user);
    await this.auth.rateLimit(req, `analysis-compare:${user.coachId}`, 60);
    return this.analysis.comparison(user.coachId, id, body);
  }
}
@Module({})
export class AnalysisModule {
  static register(
    client: PrismaClient,
    config: Config,
    queue?: IntegrationQueue,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: AnalysisModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [AnalysisController],
      providers: [
        {
          provide: AnalysisService,
          useValue: new AnalysisService(client, config, queue),
        },
      ],
    };
  }
}
