import { DynamicModule, Module } from '@nestjs/common';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { AthletesController } from './athletes.controller.js';
import { AthletesService } from './athletes.service.js';
@Module({})
export class AthletesModule {
  static register(
    client: PrismaClient,
    config: Config,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: AthletesModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [AthletesController],
      providers: [
        { provide: AthletesService, useValue: new AthletesService(client) },
      ],
    };
  }
}
