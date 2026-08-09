import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
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
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
