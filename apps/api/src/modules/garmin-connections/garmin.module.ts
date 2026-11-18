import { Module, type DynamicModule } from '@nestjs/common';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import { AuthModule } from '../auth/auth.module.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { GarminController, GarminMockController } from './garmin.controller.js';
import { GarminService } from './garmin.service.js';
@Module({})
export class GarminModule {
  static register(
    client: PrismaClient,
    config: Config,
    service: GarminService,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: GarminModule,
      imports: [AuthModule.register(client, config, provider)],
      controllers: [
        GarminController,
        ...(config.GARMIN_PROVIDER === 'mock' ? [GarminMockController] : []),
      ],
      providers: [{ provide: GarminService, useValue: service }],
    };
  }
}
