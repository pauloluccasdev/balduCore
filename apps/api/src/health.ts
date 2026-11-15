import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { DatabaseHealth } from './database.js';
export const DATABASE = Symbol('DATABASE');
@ApiTags('Operação')
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHealth) {}
  @Get()
  @ApiOperation({ summary: 'Liveness do processo, independente do banco' })
  @ApiResponse({ status: 200, description: 'Processo disponível' })
  live() {
    return { status: 'ok', service: 'balducore-api' };
  }
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness com consulta real ao PostgreSQL via Prisma',
  })
  @ApiResponse({ status: 200, description: 'Banco acessível' })
  @ApiResponse({ status: 503, description: 'Banco indisponível' })
  async ready() {
    try {
      await this.database.ping();
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'down',
      });
    }
  }
}
