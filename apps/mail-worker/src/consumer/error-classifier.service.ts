import { Injectable, Logger } from '@nestjs/common';

export type ErrorClassification = 'transient' | 'permanent';

@Injectable()
export class ErrorClassifierService {
    private readonly logger = new Logger(ErrorClassifierService.name);

    /**
     * Classifies an error as transient (retryable) or permanent (non-retryable).
     *
     * Permanent errors:
     *   - SMTP 5xx client errors (550 invalid recipient, 553 bad sender, etc.)
     *   - Rendering/template errors (bad Handlebars syntax)
     *   - Validation errors (missing required fields)
     *
     * Transient errors:
     *   - SMTP 4xx temporary failures (421 service unavailable, 450 busy)
     *   - Network timeouts, DNS failures
     *   - Connection refused / reset
     *   - Rate limiting (429)
     */
    classify(error: Error): ErrorClassification {
        const message = error.message.toLowerCase();
        const name = error.name;

        // ─── Permanent: Rendering errors ────────────────
        if (name === 'RenderingException') {
            return 'permanent';
        }

        // ─── Permanent: Suppressed recipient ────────────
        if (name === 'SuppressedRecipientException') {
            return 'permanent';
        }

        // ─── Permanent: SMTP 5xx errors ─────────────────
        if (
            message.includes('550') ||
            message.includes('551') ||
            message.includes('552') ||
            message.includes('553') ||
            message.includes('554') ||
            message.includes('invalid recipient') ||
            message.includes('user unknown') ||
            message.includes('mailbox not found') ||
            message.includes('relay denied')
        ) {
            return 'permanent';
        }

        // ─── Transient: Network / Connection errors ─────
        if (
            message.includes('timeout') ||
            message.includes('etimedout') ||
            message.includes('econnrefused') ||
            message.includes('econnreset') ||
            message.includes('enotfound') ||
            message.includes('421') ||
            message.includes('450') ||
            message.includes('451') ||
            message.includes('452') ||
            message.includes('connection') ||
            message.includes('rate limit') ||
            message.includes('too many')
        ) {
            return 'transient';
        }

        // ─── Default: treat unknown errors as transient ─
        this.logger.warn(
            `Unknown error classified as transient: ${name} — ${error.message}`,
        );
        return 'transient';
    }
}
