import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, cookie } from './security.js';
import { BadRequestException } from '@nestjs/common';
@ApiExcludeController()
@Controller('auth')
export class DemoController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('demo')
  async login(
    @Req() request: Request,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    const parsed = z
      .object({ account: z.enum(['1', '2']) })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Conta demonstrativa inválida.');
    const { account } = parsed.data;
    const token = await this.auth.demoLogin(request, account);
    response.setHeader(
      'Set-Cookie',
      cookie(
        SESSION_COOKIE,
        token,
        this.auth.config.SESSION_HOURS * 3600,
        false,
      ),
    );
    response.status(200).json({ isSynthetic: true });
  }
}
