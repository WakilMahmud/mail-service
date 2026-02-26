import * as Joi from 'joi';

export const validationSchema = Joi.object({
    // Application
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    API_PORT: Joi.number().default(3000),
    WORKER_PORT: Joi.number().default(3001),

    // Database
    DATABASE_URL: Joi.string().uri().required(),

    // RabbitMQ
    RABBITMQ_URL: Joi.string().required(),

    // Redis
    REDIS_HOST: Joi.string().default('localhost'),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_PASSWORD: Joi.string().allow('').default(''),

    // SMTP
    SMTP_HOST: Joi.string().default('localhost'),
    SMTP_PORT: Joi.number().default(1025),
    SMTP_SECURE: Joi.boolean().default(false),
    SMTP_USER: Joi.string().allow('').optional(),
    SMTP_PASSWORD: Joi.string().allow('').optional(),

    // S3 / MinIO
    S3_ENDPOINT: Joi.string().optional(),
    S3_ACCESS_KEY: Joi.string().optional(),
    S3_SECRET_KEY: Joi.string().optional(),
    S3_BUCKET: Joi.string().default('iep-attachments'),
    S3_REGION: Joi.string().default('us-east-1'),

    // Rate Limiting
    RATE_LIMIT_DEFAULT: Joi.number().default(100),
    RATE_LIMIT_WINDOW_SECONDS: Joi.number().default(60),

    // Logging
    LOG_LEVEL: Joi.string()
        .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
        .default('info'),
});
