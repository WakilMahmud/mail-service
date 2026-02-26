import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
    HealthCheckService,
    HealthCheck,
    HealthCheckResult,
} from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RabbitMQHealthIndicator } from './rabbitmq.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
        private readonly prismaHealth: PrismaHealthIndicator,
        private readonly rabbitHealth: RabbitMQHealthIndicator,
    ) { }

    @Get('live')
    @HealthCheck()
    @ApiOperation({ summary: 'Liveness probe' })
    liveness(): Promise<HealthCheckResult> {
        return this.health.check([]);
    }

    @Get('ready')
    @HealthCheck()
    @ApiOperation({ summary: 'Readiness probe — checks DB + RabbitMQ' })
    readiness(): Promise<HealthCheckResult> {
        return this.health.check([
            () => this.prismaHealth.isHealthy('database'),
            () => this.rabbitHealth.isHealthy('rabbitmq'),
        ]);
    }
}
