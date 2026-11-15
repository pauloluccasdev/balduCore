import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AthletesService } from './athletes.service.js';
@ApiTags('Alunos')
@ApiCookieAuth('coachSession')
@Controller('athletes')
export class AthletesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AthletesService) private readonly athletes: AthletesService,
  ) {}
  @Get()
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Nome/e-mail, máximo 120 caracteres',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'active', 'ended'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Padrão 20, máximo 100',
  })
  async list(@Req() request: Request, @Query() query: unknown) {
    const principal = await this.auth.authenticate(request);
    return this.athletes.list(principal.coachId, query);
  }
  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const principal = await this.auth.authenticate(request);
    return this.athletes.get(principal.coachId, id);
  }
  @Post()
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Obtido pela sessão; Origin precisa corresponder à APP_ORIGIN',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'email'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 120 },
        email: { type: 'string', format: 'email', maxLength: 254 },
      },
    },
  })
  async create(@Req() request: Request, @Body() body: unknown) {
    const principal = await this.auth.authenticate(request);
    this.auth.verifyMutation(request, principal);
    await this.auth.rateLimit(request, `write:${principal.coachId}`, 60);
    return this.athletes.create(principal.coachId, body);
  }
  @Patch(':id')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'email', 'version'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 120 },
        email: { type: 'string', format: 'email', maxLength: 254 },
        version: { type: 'integer', minimum: 1 },
      },
    },
  })
  async update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.auth.authenticate(request);
    this.auth.verifyMutation(request, principal);
    await this.auth.rateLimit(request, `write:${principal.coachId}`, 60);
    return this.athletes.update(principal.coachId, id, body);
  }
}
