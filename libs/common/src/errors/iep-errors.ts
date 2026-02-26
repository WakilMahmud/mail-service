import { HttpException, HttpStatus } from '@nestjs/common';

export class IdempotencyConflictException extends HttpException {
    constructor(existingMessageId: string) {
        super(
            {
                statusCode: HttpStatus.OK,
                message: 'Message already created with this idempotency key',
                messageId: existingMessageId,
            },
            HttpStatus.OK,
        );
    }
}

export class TenantNotFoundException extends HttpException {
    constructor() {
        super(
            {
                statusCode: HttpStatus.UNAUTHORIZED,
                message: 'Invalid API key',
            },
            HttpStatus.UNAUTHORIZED,
        );
    }
}

export class MessageNotFoundException extends HttpException {
    constructor(messageId: string) {
        super(
            {
                statusCode: HttpStatus.NOT_FOUND,
                message: `Message ${messageId} not found`,
            },
            HttpStatus.NOT_FOUND,
        );
    }
}

export class RenderingException extends Error {
    constructor(
        message: string,
        public readonly field: string,
    ) {
        super(`Failed to render ${field}: ${message}`);
        this.name = 'RenderingException';
    }
}

export class SuppressedRecipientException extends Error {
    constructor(public readonly email: string) {
        super(`Recipient ${email} is on the suppression list`);
        this.name = 'SuppressedRecipientException';
    }
}
