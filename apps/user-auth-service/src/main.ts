import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import helmet from 'helmet';
import * as compression from 'compression';
import { json, urlencoded } from 'express';
// @ts-ignore
import * as promBundle from 'express-prom-bundle';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  }));

  app.use((compression as any)({
    threshold: 1024,
  }));

  app.use(json({ limit: '10kb' }));
  app.use(urlencoded({ extended: true, limit: '10kb' }));

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'metrics'],
  });

  app.use((promBundle as any)({
    includeMethod: true,
    includePath: true,
    includeStatusCode: true,
    promClient: { collectDefaultMetrics: {} },
  }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    disableErrorMessages: process.env.NODE_ENV === 'production',
  }));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port: 3011 },
  });

  app.enableShutdownHooks();

  process.on('SIGTERM', () => {
    Logger.log('SIGTERM received — shutting down gracefully...', 'Bootstrap');
  });
  process.on('SIGINT', () => {
    Logger.log('SIGINT received — shutting down gracefully...', 'Bootstrap');
  });

  await app.startAllMicroservices();
  await app.listen(3001);
  Logger.log('🚀 User Auth Service — HTTP :3001 | TCP :3011', 'Bootstrap');
  Logger.log('📊 Metrics available at /metrics', 'Bootstrap');
  Logger.log('💚 Health check at /health', 'Bootstrap');
}
bootstrap();
