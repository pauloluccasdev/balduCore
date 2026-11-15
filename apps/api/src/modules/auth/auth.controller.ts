import {
  ApiCookieAuth,
  ApiHeader,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { Controller, Get, Post, Req, Res, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ATTEMPT_COOKIE, SESSION_COOKIE, cookie } from './security.js';
@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get('status')
  status() {
    return {
      configured: Boolean(
        this.auth.config.GOOGLE_CLIENT_ID && this.auth.config.AUTH_SECRET,
      ),
    };
  }
  @Get('google')
  @ApiResponse({
    status: 303,
    description: 'Redireciona ao Google com tentativa vinculada ao navegador',
  })
  async login(@Req() request: Request, @Res() response: Response) {
    await this.auth.rateLimit(request, 'login', 15);
    const result = await this.auth.start();
    response.setHeader(
      'Set-Cookie',
      cookie(
        ATTEMPT_COOKIE,
        result.browser,
        600,
        this.auth.config.NODE_ENV === 'production',
      ),
    );
    response.redirect(303, result.url);
  }
  @Get('google/callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    try {
      await this.auth.rateLimit(request, 'callback', 30);
      const token = await this.auth.finish(request);
      response.setHeader('Set-Cookie', [
        cookie(
          SESSION_COOKIE,
          token,
          this.auth.config.SESSION_HOURS * 3600,
          this.auth.config.NODE_ENV === 'production',
        ),
        cookie(
          ATTEMPT_COOKIE,
          '',
          0,
          this.auth.config.NODE_ENV === 'production',
        ),
      ]);
      response.redirect(303, `${this.auth.config.APP_ORIGIN}/`);
    } catch {
      response.setHeader(
        'Set-Cookie',
        cookie(
          ATTEMPT_COOKIE,
          '',
          0,
          this.auth.config.NODE_ENV === 'production',
        ),
      );
      response.redirect(
        303,
        `${this.auth.config.APP_ORIGIN}/login?error=authentication_failed`,
      );
    }
  }
  @Get('session')
  @ApiCookieAuth('coachSession')
  async session(@Req() request: Request) {
    const principal = await this.auth.authenticate(request);
    return {
      coach: {
        id: principal.coachId,
        name: principal.name,
        email: principal.email,
      },
      csrf: principal.csrf,
    };
  }
  @Post('logout')
  @ApiCookieAuth('coachSession')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiResponse({ status: 204, description: 'Sessão revogada' })
  async logout(@Req() request: Request, @Res() response: Response) {
    const principal = await this.auth.authenticate(request);
    this.auth.verifyMutation(request, principal);
    await this.auth.logout(principal);
    response.setHeader(
      'Set-Cookie',
      cookie(SESSION_COOKIE, '', 0, this.auth.config.NODE_ENV === 'production'),
    );
    response.status(204).send();
  }
}
