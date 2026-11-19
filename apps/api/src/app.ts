import { MonitoringModule } from './modules/monitoring/monitoring.module.js';
import { FeedbackModule } from './modules/coach-feedback/feedback.module.js';
import { AnalysisModule } from './modules/sports-analysis/analysis.module.js';
import { ActivitiesModule } from './modules/activities/activities.module.js';
import 'reflect-metadata';
import { createGarminRuntime } from './modules/garmin-connections/runtime.js';
import { GarminModule } from './modules/garmin-connections/garmin.module.js';
import { randomUUID } from 'node:crypto';
import {
  Module,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { DatabaseHealth } from './database.js';
import { DATABASE, HealthController } from './health.js';
import { InvitationsModule } from './modules/invitations/invitations.module.js';
import { AthletesModule } from './modules/athletes/athletes.module.js';
import type { PrismaClient } from './generated/prisma/client.js';
import type { Config } from './config.js';
import type { IdentityProvider } from './modules/auth/google-provider.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
@Catch()
class SanitizedErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
    } else if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      (error.status === 400 || error.status === 413)
    ) {
      response
        .status(error.status)
        .json({ message: 'Corpo da requisição inválido ou excessivo.' });
    } else {
      response
        .status(503)
        .json({ message: 'Serviço indisponível. Tente novamente.' });
    }
  }
}

export async function createApp(
  database: DatabaseHealth,
  logger: Logger,
  exposeDocs = false,
  features?: {
    client: PrismaClient;
    config: Config;
    provider?: IdentityProvider;
    garmin?: Awaited<ReturnType<typeof createGarminRuntime>>;
  },
) {
  const garmin = features
    ? (features.garmin ??
      (await createGarminRuntime(features.client, features.config, logger)))
    : undefined;
  @Module({
    imports: features
      ? [
          MonitoringModule.register(
            features.client,
            features.config,
            features.provider,
          ),
          FeedbackModule.register(
            features.client,
            features.config,
            features.provider,
          ),
          AnalysisModule.register(
            features.client,
            features.config,
            garmin?.service.queue,
            features.provider,
          ),
          ActivitiesModule.register(
            features.client,
            features.config,
            garmin?.service.queue,
            features.provider,
          ),
          GarminModule.register(
            features.client,
            features.config,
            garmin!.service,
            features.provider,
          ),
          InvitationsModule.register(
            features.client,
            features.config,
            features.provider,
            garmin?.service.queue,
          ),
          AthletesModule.register(
            features.client,
            features.config,
            features.provider,
          ),
        ]
      : [],
    controllers: [HealthController],
    providers: [
      { provide: DATABASE, useValue: database },
      {
        provide: 'DATABASE_LIFECYCLE',
        useValue: {
          onApplicationShutdown: async () => {
            try {
              await garmin?.close();
            } finally {
              await database.close();
            }
          },
        },
      },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
    rawBody: true,
  }).catch(async (error: unknown) => {
    await garmin?.close();
    throw error;
  });
  app.useGlobalFilters(new SanitizedErrors());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      const correlationId = randomUUID();
      response.setHeader('X-Request-Id', correlationId);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      const start = performance.now();
      response.on('finish', () => {
        // Sem URL, query, headers, body ou exceção bruta: futuras rotas podem conter tokens.
        logger.info(
          {
            correlationId,
            method: request.method,
            statusCode: response.statusCode,
            durationMs: Math.round(performance.now() - start),
          },
          'http_request',
        );
      });
      next();
    },
  );
  // O teto global continua pequeno; somente o diário admite JSON de até 64 KiB.
  // rawBody preserva também a verificação de assinatura do provider mock.
  app.useBodyParser('json', { limit: '64kb' });
  app.use(
    (
      req: Request & { rawBody?: Buffer },
      res: Response,
      next: NextFunction,
    ) => {
      const feedback =
        req.method === 'PUT' &&
        /^\/activities\/[^/]+\/feedback$/.test(req.path);
      if ((req.rawBody?.length ?? 0) > 16384 && !feedback) {
        res.status(413).json({ message: 'Corpo da requisição excessivo.' });
        return;
      }
      next();
    },
  );
  app.useBodyParser('raw', { type: 'application/octet-stream', limit: '5mb' });
  if (exposeDocs) {
    const spec = new DocumentBuilder()
      .setTitle('BalduCore API')
      .setDescription(
        'Autenticação e alunos do treinador; convites/aceites públicos apenas no demo local. Cookies e CSRF próprios em cada jornada.',
      )
      .setVersion('0.6.0')
      .addCookieAuth(
        'balducore_session',
        { type: 'apiKey', in: 'cookie' },
        'coachSession',
      )
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, spec));
  }
  app.enableShutdownHooks();
  return app;
}
