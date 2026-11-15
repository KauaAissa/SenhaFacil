import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { getHttpConfiguration } from './http.config';

async function bootstrap(): Promise<void> {
  const configuration = getHttpConfiguration(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: configuration.trustProxy }),
  );

  // Security: strict HTTP response headers
  await app.register(fastifyHelmet);

  // Security: strip unknown properties, enforce type coercion
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS: restrict to known app origins
  app.enableCors({
    origin: configuration.origins,
  });

  app.enableShutdownHooks();
  await app.listen(configuration.port, '0.0.0.0');
}

void bootstrap();
