import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    // ─── Structured Logging ───────────────────────────
    app.useLogger(app.get(Logger));

    // ─── Graceful Shutdown ────────────────────────────
    app.enableShutdownHooks();

    const port = process.env.WORKER_PORT || 3001;
    await app.listen(port);

    const logger = new (require('@nestjs/common').Logger)('Bootstrap');
    logger.log(`🔧 Mail Worker listening on port ${port} (health only)`);
}

bootstrap();
