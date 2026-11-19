import {
  Module,
  Controller,
  Get,
  Put,
  Param,
  Req,
  Query,
  Body,
  Inject,
  type DynamicModule,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiHeader,
  ApiBody,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { FeedbackService } from './feedback.service.js';
@ApiTags('Feedback do treinador')
@ApiCookieAuth('coachSession')
@Controller()
class FeedbackController {
  constructor(
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(FeedbackService) readonly feedback: FeedbackService,
  ) {}
  private async reader(req: Request) {
    const user = await this.auth.authenticate(req);
    await this.auth.rateLimit(req, `feedback-read:${user.coachId}`, 120);
    return user.coachId;
  }
  @Get('activities/:id/feedback')
  @ApiOperation({
    summary:
      'Diário atual e eventos determinísticos da revisão corrente; página de até 50 eventos',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async get(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.feedback.get(await this.reader(req), id, query);
  }
  @Put('activities/:id/feedback')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary:
      'Publica revisão imutável com versão esperada; conflito de edição/contexto retorna 409',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'expectedVersion',
        'inputRevision',
        'inputHash',
        'analysisId',
        'content',
      ],
      properties: {
        expectedVersion: { type: 'integer', minimum: 0 },
        inputRevision: { type: 'integer', minimum: 1 },
        inputHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        analysisId: { type: 'string', nullable: true, format: 'uuid' },
        confirmContext: { type: 'boolean', default: false },
        content: {
          type: 'object',
          additionalProperties: false,
          required: [
            'execution',
            'observations',
            'decisions',
            'points',
            'verdicts',
          ],
          properties: {
            execution: { type: 'string', maxLength: 4000 },
            observations: { type: 'string', maxLength: 4000 },
            decisions: { type: 'string', maxLength: 4000 },
            points: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['id', 'category', 'source', 'note', 'scope'],
                additionalProperties: false,
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  category: {
                    type: 'string',
                    enum: [
                      'walk',
                      'stop',
                      'hydration',
                      'nutrition',
                      'climb',
                      'discomfort',
                      'pace',
                      'other',
                    ],
                  },
                  source: {
                    type: 'string',
                    enum: ['coach_observation', 'athlete_report'],
                  },
                  note: { type: 'string', minLength: 1, maxLength: 1000 },
                  scope: {
                    oneOf: [
                      {
                        type: 'object',
                        required: ['kind'],
                        additionalProperties: false,
                        properties: {
                          kind: { type: 'string', enum: ['whole'] },
                        },
                      },
                      ...['time', 'distance'].map((kind) => ({
                        type: 'object' as const,
                        required: ['kind', 'from', 'to'],
                        additionalProperties: false,
                        properties: {
                          kind: { type: 'string' as const, enum: [kind] },
                          from: { type: 'number' as const, minimum: 0 },
                          to: { type: 'number' as const, minimum: 0 },
                        },
                      })),
                    ],
                  },
                },
              },
            },
            verdicts: {
              type: 'array',
              maxItems: 100,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['eventId', 'verdict'],
                properties: {
                  eventId: { type: 'string', minLength: 1, maxLength: 80 },
                  verdict: {
                    type: 'string',
                    enum: ['correct', 'partial', 'incorrect'],
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async save(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.auth.authenticate(req);
    this.auth.verifyMutation(req, user);
    await this.auth.rateLimit(req, `feedback-write:${user.coachId}`, 30);
    return this.feedback.save(user.coachId, id, body);
  }
  @Get('activities/:id/feedback/revisions')
  @ApiQuery({ name: 'page', required: false, type: Number })
  async history(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.feedback.revisions(await this.reader(req), id, query);
  }
  @Get('activities/:id/feedback/revisions/:version')
  async revision(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    return this.feedback.revisions(await this.reader(req), id, {}, version);
  }
  @Get('athletes/:id/feedback')
  @ApiQuery({ name: 'page', required: false, type: Number })
  async athlete(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.feedback.forAthlete(await this.reader(req), id, query);
  }
}
@Module({})
export class FeedbackModule {
  static register(
    client: PrismaClient,
    config: Config,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: FeedbackModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [FeedbackController],
      providers: [
        { provide: FeedbackService, useValue: new FeedbackService(client) },
      ],
    };
  }
}
