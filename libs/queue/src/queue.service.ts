import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(QueueService.name);
    private connection!: ChannelModel;
    private channel!: ConfirmChannel;
    private isConnected = false;

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit(): Promise<void> {
        await this.connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.close();
    }

    private async connect(): Promise<void> {
        const url = this.configService.get<string>('queue.url')!;
        const exchange = this.configService.get<string>('queue.exchange')!;
        const processQueue = this.configService.get<string>('queue.processQueue')!;
        const routingKey = this.configService.get<string>('queue.routingKey')!;
        const dlxExchange = this.configService.get<string>('queue.dlxExchange')!;
        const retryQueues = this.configService.get<
            { name: string; ttl: number }[]
        >('queue.retryQueues')!;

        this.connection = await amqplib.connect(url);
        this.channel = await this.connection.createConfirmChannel();

        // ─── Assert exchanges ───────────────────────────
        await this.channel.assertExchange(exchange, 'direct', { durable: true });
        await this.channel.assertExchange(dlxExchange, 'direct', { durable: true });

        // ─── Assert main process queue ──────────────────
        await this.channel.assertQueue(processQueue, {
            durable: true,
            deadLetterExchange: dlxExchange,
            deadLetterRoutingKey: 'retry',
        });
        await this.channel.bindQueue(processQueue, exchange, routingKey);

        // ─── Assert retry queues with TTL ───────────────
        for (const rq of retryQueues) {
            await this.channel.assertQueue(rq.name, {
                durable: true,
                messageTtl: rq.ttl,
                deadLetterExchange: exchange,
                deadLetterRoutingKey: routingKey,
            });
            await this.channel.bindQueue(rq.name, dlxExchange, 'retry');
        }

        this.isConnected = true;
        this.logger.log('Connected to RabbitMQ, topology asserted');

        this.connection.connection.on('close', () => {
            this.isConnected = false;
            this.logger.warn('RabbitMQ connection closed');
        });

        this.connection.connection.on('error', (err: Error) => {
            this.isConnected = false;
            this.logger.error('RabbitMQ connection error', err.message);
        });
    }

    async publish(messageId: string, priority: string = 'normal'): Promise<void> {
        const exchange = this.configService.get<string>('queue.exchange')!;
        const routingKey = this.configService.get<string>('queue.routingKey')!;

        const priorityMap: Record<string, number> = {
            low: 1,
            normal: 5,
            high: 8,
            critical: 10,
        };

        const payload = Buffer.from(JSON.stringify({ messageId }));

        return new Promise<void>((resolve, reject) => {
            this.channel.publish(
                exchange,
                routingKey,
                payload,
                {
                    persistent: true,
                    priority: priorityMap[priority] ?? 5,
                    contentType: 'application/json',
                    messageId,
                    timestamp: Math.floor(Date.now() / 1000),
                },
                (err) => {
                    if (err) {
                        this.logger.error(`Failed to publish message ${messageId}`, err.message);
                        reject(err);
                    } else {
                        this.logger.debug(`Published message ${messageId} to queue`);
                        resolve();
                    }
                },
            );
        });
    }

    getChannel(): ConfirmChannel {
        return this.channel;
    }

    isReady(): boolean {
        return this.isConnected;
    }

    async close(): Promise<void> {
        try {
            if (this.channel) await this.channel.close();
            if (this.connection) await this.connection.close();
            this.logger.log('RabbitMQ connection closed gracefully');
        } catch (err) {
            this.logger.error('Error closing RabbitMQ connection', (err as Error).message);
        }
    }
}
