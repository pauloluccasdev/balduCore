import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { cookie, csrfFor, equal, readCookie } from '../auth/security.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('Convites demonstrativos')
@ApiCookieAuth('coachSession')
@Controller('athletes/:athleteId')
export class InvitationsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}
  @Get('invitations')
  async list(@Req() request: Request, @Param('athleteId') athleteId: string) {
    const principal = await this.auth.authenticate(request);
    return this.invitations.list(principal.coachId, athleteId);
  }
  private async mutation(request: Request) {
    const principal = await this.auth.authenticate(request);
    this.auth.verifyMutation(request, principal);
    await this.auth.rateLimit(request, `invitations:${principal.coachId}`, 30);
    return principal;
  }
  @Post('invitations')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async create(@Req() request: Request, @Param('athleteId') athleteId: string) {
    return this.invitations.create(
      (await this.mutation(request)).coachId,
      athleteId,
    );
  }
  @Post('invitations/:id/revoke')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async revoke(
    @Req() request: Request,
    @Param('athleteId') athleteId: string,
    @Param('id') id: string,
  ) {
    return this.invitations.revoke(
      (await this.mutation(request)).coachId,
      athleteId,
      id,
    );
  }
  @Post('withdrawal-link')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  async withdrawal(
    @Req() request: Request,
    @Param('athleteId') athleteId: string,
  ) {
    return this.invitations.issueWithdrawal(
      (await this.mutation(request)).coachId,
      athleteId,
    );
  }
}

const ENROLLMENT_COOKIE = 'balducore_enrollment';
const WITHDRAWAL_COOKIE = 'balducore_withdrawal';
@ApiTags('Jornada pública demonstrativa')
@Controller('public')
export class PublicInvitationsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}
  private token(request: Request, name = ENROLLMENT_COOKIE) {
    return readCookie(
      request,
      name,
      this.auth.config.NODE_ENV === 'production',
    );
  }
  private async protect(request: Request, name?: string) {
    if (request.headers.origin !== this.auth.config.APP_ORIGIN)
      throw new ForbiddenException('Origem não autorizada.');
    if (name) {
      const token = this.token(request, name);
      const sent = request.headers['x-csrf-token'];
      if (
        !token ||
        typeof sent !== 'string' ||
        !equal(sent, csrfFor(token, this.auth.config.AUTH_SECRET))
      )
        throw new ForbiddenException('Requisição não autorizada.');
    }
    await this.auth.rateLimit(request, 'public-invitations', 30);
  }
  @Post('invitation/preview')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string' } },
      additionalProperties: false,
    },
  })
  async preview(@Req() request: Request, @Body() body: unknown) {
    await this.protect(request);
    return this.invitations.preview(body);
  }
  @Post('invitation/redeem')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string' } },
      additionalProperties: false,
    },
  })
  async redeem(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.protect(request);
    const token = await this.invitations.redeem(body);
    response.setHeader(
      'Set-Cookie',
      cookie(ENROLLMENT_COOKIE, token, 1800, false),
    );
    return { redeemed: true, isSynthetic: true };
  }
  @Get('enrollment')
  async session(@Req() request: Request) {
    await this.auth.rateLimit(request, 'public-session', 120);
    const token = this.token(request);
    return {
      ...(await this.invitations.session(token)),
      csrf: csrfFor(token, this.auth.config.AUTH_SECRET),
    };
  }
  @Post('enrollment/verify')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'code'],
      properties: {
        email: { type: 'string', format: 'email' },
        code: { type: 'string', pattern: '^[0-9]{6}$' },
      },
      additionalProperties: false,
    },
  })
  async verify(@Req() request: Request, @Body() body: unknown) {
    await this.protect(request, ENROLLMENT_COOKIE);
    return this.invitations.verify(this.token(request), body);
  }
  @Post('enrollment/accept')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'accompaniment', 'dataSharing', 'documents'],
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        accompaniment: { type: 'boolean', enum: [true] },
        dataSharing: { type: 'boolean', enum: [true] },
        documents: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'contentHash'],
            properties: {
              id: { type: 'string' },
              contentHash: { type: 'string' },
            },
          },
        },
      },
      additionalProperties: false,
    },
  })
  async accept(@Req() request: Request, @Body() body: unknown) {
    await this.protect(request, ENROLLMENT_COOKIE);
    return this.invitations.accept(this.token(request), body);
  }
  @Post('withdrawal/redeem')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string' } },
      additionalProperties: false,
    },
  })
  async redeemWithdrawal(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.protect(request);
    const token = await this.invitations.redeemWithdrawal(body);
    response.setHeader(
      'Set-Cookie',
      cookie(WITHDRAWAL_COOKIE, token, 1800, false),
    );
    return { redeemed: true, isSynthetic: true };
  }
  @Get('withdrawal')
  async withdrawalSession(@Req() request: Request) {
    await this.auth.rateLimit(request, 'public-session', 120);
    const token = this.token(request, WITHDRAWAL_COOKIE);
    return {
      ...(await this.invitations.withdrawalSession(token)),
      csrf: csrfFor(token, this.auth.config.AUTH_SECRET),
    };
  }
  @Post('withdrawal/confirm')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['confirm'],
      properties: { confirm: { type: 'boolean', enum: [true] } },
      additionalProperties: false,
    },
  })
  async withdraw(@Req() request: Request, @Body() body: unknown) {
    await this.protect(request, WITHDRAWAL_COOKIE);
    return this.invitations.withdraw(
      this.token(request, WITHDRAWAL_COOKIE),
      body,
    );
  }
}
