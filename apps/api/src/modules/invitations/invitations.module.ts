import type { IntegrationQueue } from '../activity-processing/queue.js';
import { Module, type DynamicModule } from '@nestjs/common';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config.js';
import type { IdentityProvider } from '../auth/google-provider.js';
import { AuthModule } from '../auth/auth.module.js';
import {
  InvitationsController,
  PublicInvitationsController,
} from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
@Module({})
export class InvitationsModule {
  static register(
    client: PrismaClient,
    config: Config,
    provider?: IdentityProvider,
    queue?: IntegrationQueue,
  ): DynamicModule {
    // Verificação fictícia nunca é disponibilizada com identidades Google ou em produção.
    const demo =
      config.AUTH_MODE === 'demo' && config.NODE_ENV !== 'production';
    return {
      module: InvitationsModule,
      imports: demo ? [AuthModule.register(client, config, provider)] : [],
      controllers: demo
        ? [InvitationsController, PublicInvitationsController]
        : [],
      providers: demo
        ? [
            {
              provide: InvitationsService,
              useValue: new InvitationsService(client, config, queue),
            },
          ]
        : [],
    };
  }
}
