import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import {
    appConfig,
    databaseConfig,
    queueConfig,
    redisConfig,
    smtpConfig,
    validationSchema,
} from '../../../config';
import { DatabaseModule } from '@iep/database';
import { QueueModule } from '@iep/queue';
import { RenderingModule } from '@iep/rendering';
import { ProvidersModule } from '@iep/providers';
import { ConsumerModule } from './consumer/consumer.module';

@Module({
    imports: [
        // ─── Configuration ──────────────────────────────
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig, queueConfig, redisConfig, smtpConfig],
            validationSchema,
            validationOptions: {
                abortEarly: true,
                allowUnknown: true,
            },
        }),

        // ─── Structured Logging ─────────────────────────
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.LOG_LEVEL || 'info',
                transport:
                    process.env.NODE_ENV !== 'production'
                        ? { target: 'pino-pretty', options: { colorize: true } }
                        : undefined,
            },
        }),

        // ─── Infrastructure ─────────────────────────────
        DatabaseModule,
        QueueModule,
        RenderingModule,
        ProvidersModule,

        // ─── Feature Modules ────────────────────────────
        ConsumerModule,
    ],
})
export class AppModule { }
