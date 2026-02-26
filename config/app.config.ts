import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
    nodeEnv: process.env.NODE_ENV || 'development',
    apiPort: parseInt(process.env.API_PORT || '3000', 10),
    workerPort: parseInt(process.env.WORKER_PORT || '3001', 10),
}));
