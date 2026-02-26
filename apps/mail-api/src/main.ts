import { NestFactory } from '@nestjs/core';
import {
    ValidationPipe,
    VersioningType,
    Logger as NestLogger,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    // ─── Structured Logging (pino) ────────────────────
    app.useLogger(app.get(Logger));

    // ─── Security ─────────────────────────────────────
    app.use(helmet());
    app.enableCors();

    // ─── API Versioning ───────────────────────────────
    app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: '1',
    });

    // ─── Global Validation Pipe ───────────────────────
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    // ─── Swagger / OpenAPI ────────────────────────────
    const swaggerConfig = new DocumentBuilder()
        .setTitle('IEP — Internal Email Platform')
        .setDescription('Production-grade email sending API')
        .setVersion('1.0')
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
        .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);

    // ─── Graceful Shutdown ────────────────────────────
    app.enableShutdownHooks();

    const port = process.env.API_PORT || 3000;
    await app.listen(port);

    const logger = new NestLogger('Bootstrap');
    logger.log(`🚀 Mail API listening on port ${port}`);
    logger.log(`📖 Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
