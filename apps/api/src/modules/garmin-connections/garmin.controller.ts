import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  ForbiddenException,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { csrfFor, digest, equal, readCookie } from '../auth/security.js';
import { GarminService, SCENARIOS } from './garmin.service.js';
@ApiTags('Conexão e sincronização Garmin')
@ApiCookieAuth('coachSession')
@Controller()
export class GarminController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GarminService) private readonly garmin: GarminService,
  ) {}
  @Get('garmin')
  async overview(@Req() request: Request) {
    return this.garmin.overview(
      (await this.auth.authenticate(request)).coachId,
    );
  }
  @Get('athletes/:athleteId/garmin')
  async status(@Req() request: Request, @Param('athleteId') athleteId: string) {
    return this.garmin.status(
      (await this.auth.authenticate(request)).coachId,
      athleteId,
    );
  }
  private async mutation(request: Request) {
    const principal = await this.auth.authenticate(request);
    this.auth.verifyMutation(request, principal);
    await this.auth.rateLimit(request, `garmin:${principal.coachId}`, 30);
    return principal;
  }
  @Post('athletes/:athleteId/garmin/authorization-link')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async authorizationLink(
    @Req() request: Request,
    @Param('athleteId') athleteId: string,
  ) {
    return this.garmin.authorizationLink({
      coachId: (await this.mutation(request)).coachId,
      athleteId,
    });
  }
  @Post('athletes/:athleteId/garmin/disconnect')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async disconnect(
    @Req() request: Request,
    @Param('athleteId') athleteId: string,
  ) {
    return this.garmin.disconnect({
      coachId: (await this.mutation(request)).coachId,
      athleteId,
    });
  }
  @Post('athletes/:athleteId/garmin/events/:eventId/retry')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async retry(
    @Req() request: Request,
    @Param('athleteId') athleteId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.garmin.retry(
      { coachId: (await this.mutation(request)).coachId, athleteId },
      eventId,
    );
  }
}
@ApiTags('Garmin mock — somente demo local')
@Controller()
export class GarminMockController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GarminService) private readonly garmin: GarminService,
  ) {}
  private async protect(request: Request, csrf = true) {
    if (request.headers.origin !== this.auth.config.APP_ORIGIN)
      throw new ForbiddenException('Origem não autorizada.');
    const token = readCookie(request, 'balducore_enrollment');
    if (
      csrf &&
      (!token ||
        typeof request.headers['x-csrf-token'] !== 'string' ||
        !equal(
          request.headers['x-csrf-token'],
          csrfFor(token, this.auth.config.AUTH_SECRET),
        ))
    )
      throw new ForbiddenException('Jornada não autorizada.');
    await this.auth.rateLimit(request, `garmin-public:${digest(token)}`, 30);
    return token;
  }
  @Get('public/garmin')
  async status(@Req() request: Request) {
    await this.auth.rateLimit(request, 'garmin-public-status', 120);
    const token = readCookie(request, 'balducore_enrollment');
    const status = await this.garmin.publicStatus(token);
    return { ...status, csrf: csrfFor(token, this.auth.config.AUTH_SECRET) };
  }
  @Post('public/garmin/start')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async start(@Req() request: Request) {
    return this.garmin.start(await this.protect(request));
  }
  @Post('public/garmin/mock/finish')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['state', 'decision'],
      properties: {
        state: { type: 'string' },
        decision: { type: 'string', enum: ['approve', 'deny'] },
      },
      additionalProperties: false,
    },
  })
  async finish(@Req() request: Request, @Body() body: unknown) {
    return this.garmin.finish(await this.protect(request), body);
  }
  @Post('athletes/:athleteId/garmin/mock')
  @ApiCookieAuth('coachSession')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['scenario'],
      properties: { scenario: { type: 'string', enum: [...SCENARIOS] } },
      additionalProperties: false,
    },
  })
  async simulate(
    @Req() request: Request,
    @Param('athleteId') athleteId: string,
    @Body() body: unknown,
  ) {
    const principal = await this.auth.authenticate(request);
    this.auth.verifyMutation(request, principal);
    await this.auth.rateLimit(request, `garmin-mock:${principal.coachId}`, 30);
    return this.garmin.simulate(
      { coachId: principal.coachId, athleteId },
      body,
    );
  }
  @Post('integrations/garmin-mock/events')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Contrato de entrega BalduCore mock: não é endpoint Garmin oficial',
  })
  @ApiHeader({ name: 'X-Baldu-Mock-Timestamp', required: true })
  @ApiHeader({ name: 'X-Baldu-Mock-Signature', required: true })
  async webhook(@Req() request: RawBodyRequest<Request>) {
    await this.auth.rateLimit(request, 'garmin-mock-delivery', 120);
    return this.garmin.ingest(
      request.rawBody ?? Buffer.alloc(0),
      String(request.headers['x-baldu-mock-timestamp'] ?? ''),
      String(request.headers['x-baldu-mock-signature'] ?? ''),
    );
  }
}
