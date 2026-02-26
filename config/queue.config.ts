import { registerAs } from '@nestjs/config';

export const queueConfig = registerAs('queue', () => ({
    url: process.env.RABBITMQ_URL || 'amqp://iep:iep_secret@localhost:5672',
    exchange: 'email.exchange',
    routingKey: 'email.send',
    processQueue: 'email.process',
    dlxExchange: 'email.dlx',
    retryQueues: [
        { name: 'email.retry.1', ttl: 10_000 },   // 10s
        { name: 'email.retry.2', ttl: 60_000 },   // 1m
        { name: 'email.retry.3', ttl: 300_000 },  // 5m
    ],
    prefetch: parseInt(process.env.WORKER_PREFETCH || '10', 10),
}));
