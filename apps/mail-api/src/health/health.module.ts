import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { QueueModule } from '@iep/queue';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { RabbitMQHealthIndicator } from './rabbitmq.health';

@Module({
    imports: [TerminusModule, QueueModule],
    controllers: [HealthController],
    providers: [PrismaHealthIndicator, RabbitMQHealthIndicator],
})
export class HealthModule { }
