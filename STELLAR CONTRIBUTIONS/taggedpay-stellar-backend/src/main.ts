import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for development
  app.enableCors();

  // Set global API prefix
  app.setGlobalPrefix('api/v1');

  // Enable validation pipes for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Optional: Swagger documentation setup
  // Uncomment when @nestjs/swagger is installed
  // import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
  // const config = new DocumentBuilder()
  //   .setTitle('TaggedPay Stellar API')
  //   .setDescription('Stellar blockchain integration for TaggedPay')
  //   .setVersion('1.0.0')
  //   .addTag('stellar', 'Stellar operations')
  //   .addTag('accounts', 'Account management')
  //   .addTag('payments', 'Payment operations')
  //   .addTag('tags', 'Tag resolution and management')
  //   .build();
  // const document = SwaggerModule.createDocument(app, config);
  // SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Tagged Stellar API running on http://localhost:${port}/api/v1`);
}
bootstrap();
