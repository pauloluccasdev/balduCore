import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { DatabaseHealth } from './database.js';
import { DATABASE, HealthController } from './health.js';

export async function createApp(
  database: DatabaseHealth,
  logger: Logger,
  exposeDocs = false,
) {
  @Module({
    controllers: [HealthController],
    providers: [
      { provide: DATABASE, useValue: database },
      {
        provide: 'DATABASE_LIFECYCLE',
        useValue: { onApplicationShutdown: () => database.close() },
      },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bodyParser: false,
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      const correlationId = randomUUID();
      response.setHeader('X-Request-Id', correlationId);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
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
  if (exposeDocs) {
    const spec = new DocumentBuilder()
      .setTitle('BalduCore API')
      .setDescription('SPRINT 01: endpoints operacionais; sem API de negócio.')
      .setVersion('0.1.0')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, spec));
  }
  app.enableShutdownHooks();
  return app;
}
