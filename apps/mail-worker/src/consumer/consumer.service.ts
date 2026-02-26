import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueService } from '@iep/queue';
import { ProcessingService } from './processing.service';
import type { ConsumeMessage } from 'amqplib';

@Injectable()
export class ConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ConsumerService.name);
    private isShuttingDown = false;
    private activeJobs = 0;
    private consumerTag: string | null = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly queueService: QueueService,
        private readonly processingService: ProcessingService,
    ) { }

    async onModuleInit(): Promise<void> {
        await this.startConsuming();
    }

    async onModuleDestroy(): Promise<void> {
        this.isShuttingDown = true;
        this.logger.log('Shutting down consumer, waiting for active jobs...');

        // Cancel consumer to stop receiving new messages
        if (this.consumerTag) {
            try {
                await this.queueService.getChannel().cancel(this.consumerTag);
            } catch {
                // Channel may already be closed
            }
        }

        // Wait for active jobs to finish (max 30s)
        const maxWait = 30_000;
        const startTime = Date.now();
        while (this.activeJobs > 0 && Date.now() - startTime < maxWait) {
            this.logger.debug(`Waiting for ${this.activeJobs} active jobs to finish...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (this.activeJobs > 0) {
            this.logger.warn(`Force shutdown with ${this.activeJobs} jobs still active`);
        } else {
            this.logger.log('All jobs completed, shutdown clean');
        }
    }

    private async startConsuming(): Promise<void> {
        const queue = this.configService.get<string>('queue.processQueue')!;
        const prefetch = this.configService.get<number>('queue.prefetch')!;
        const channel = this.queueService.getChannel();

        await channel.prefetch(prefetch);

        const { consumerTag } = await channel.consume(
            queue,
            async (msg: ConsumeMessage | null) => {
                if (!msg) return;

                if (this.isShuttingDown) {
                    // Requeue during shutdown
                    channel.nack(msg, false, true);
                    return;
                }

                this.activeJobs++;

                try {
                    const payload = JSON.parse(msg.content.toString());
                    const messageId = payload.messageId as string;

                    this.logger.log(`Received job for message ${messageId}`);

                    const result = await this.processingService.process(messageId);

                    if (result.success || !result.retryable) {
                        // Success or permanent failure — acknowledge
                        channel.ack(msg);
                    } else {
                        // Transient failure — nack to send to DLX for retry
                        channel.nack(msg, false, false);
                    }
                } catch (error) {
                    this.logger.error(
                        `Unexpected error processing message: ${(error as Error).message}`,
                    );
                    // Nack and requeue on unexpected errors
                    channel.nack(msg, false, true);
                } finally {
                    this.activeJobs--;
                }
            },
            { noAck: false },
        );

        this.consumerTag = consumerTag;
        this.logger.log(
            `Consumer started on queue "${queue}" with prefetch ${prefetch}`,
        );
    }
}
