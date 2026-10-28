import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Verzel Auction API')
    .setDescription(
      'Backend da Casa de Leilões online — Elite Dev / Verzel.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  // BigInt JSON support
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-extend-native
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  await app.listen(env.PORT);
  Logger.log(`Verzel Auction API listening on :${env.PORT}`, 'Bootstrap');
  Logger.log(`Swagger UI at /api/docs`, 'Bootstrap');
}
void bootstrap();
