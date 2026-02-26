import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { QueueService } from '@iep/queue';

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
    constructor(private readonly queueService: QueueService) {
        super();
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        const isReady = this.queueService.isReady();
        if (isReady) {
            return this.getStatus(key, true);
        }
        throw new HealthCheckError(
            'RabbitMQ health check failed',
            this.getStatus(key, false, { message: 'Not connected' }),
        );
    }
}
