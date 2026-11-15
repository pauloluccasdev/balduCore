import { DynamicModule, Module } from '@nestjs/common';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleProvider, type IdentityProvider } from './google-provider.js';
@Module({})
export class AuthModule {
  static register(
    client: PrismaClient,
    config: Config,
    provider?: IdentityProvider,
  ): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: new AuthService(
            client,
            config,
            provider ?? new GoogleProvider(config),
          ),
        },
      ],
      exports: [AuthService],
    };
  }
}
