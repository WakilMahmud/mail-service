import { Injectable, Logger, Inject } from '@nestjs/common';
import { MessageRepository, EventRepository, SuppressionRepository } from '@iep/database';
import { RenderingService } from '@iep/rendering';
import {
    EMAIL_PROVIDER,
    IEmailProvider,
    SuppressedRecipientException,
} from '@iep/common';
import { ErrorClassifierService } from './error-classifier.service';
import { RecipientType } from '@prisma/client';

@Injectable()
export class ProcessingService {
    private readonly logger = new Logger(ProcessingService.name);

    constructor(
        private readonly messageRepo: MessageRepository,
        private readonly eventRepo: EventRepository,
        private readonly suppressionRepo: SuppressionRepository,
        private readonly renderingService: RenderingService,
        private readonly errorClassifier: ErrorClassifierService,
        @Inject(EMAIL_PROVIDER) private readonly emailProvider: IEmailProvider,
    ) { }

    /**
     * Full processing pipeline:
     * 1. Load message from DB
     * 2. Check suppression list for all TO recipients
     * 3. Render content with Handlebars
     * 4. Send via email provider
     * 5. Update status + record events
     */
    async process(messageId: string): Promise<{ success: boolean; retryable: boolean }> {
        this.logger.log(`Processing message ${messageId}`);

        // ─── Step 1: Load message ───────────────────────
        const message = await this.messageRepo.findByIdInternal(messageId);
        if (!message) {
            this.logger.error(`Message ${messageId} not found in DB`);
            return { success: false, retryable: false };
        }

        // Skip if already sent or permanently failed
        if (message.status === 'sent' || message.status === 'failed') {
            this.logger.warn(`Message ${messageId} already in terminal state: ${message.status}`);
            return { success: true, retryable: false };
        }

        // Mark as processing
        await this.messageRepo.updateStatus(messageId, {
            status: 'processing',
            attemptCount: message.attemptCount + 1,
            lastAttemptAt: new Date(),
        });

        await this.eventRepo.create({
            messageId,
            eventType: 'message.processing',
            payload: { attempt: message.attemptCount + 1 },
        });

        try {
            // ─── Step 2: Check suppression list ─────────────
            const toRecipients = message.recipients.filter(
                (r) => r.type === ('to' as RecipientType),
            );
            for (const recipient of toRecipients) {
                const isSuppressed = await this.suppressionRepo.isSuppressed(
                    message.tenant.id,
                    recipient.email,
                );
                if (isSuppressed) {
                    throw new SuppressedRecipientException(recipient.email);
                }
            }

            // ─── Step 3: Render content ─────────────────────
            const rendered = this.renderingService.render(
                {
                    subject: message.subject,
                    htmlBody: message.htmlBody,
                    textBody: message.textBody ?? undefined,
                },
                (message.variables as Record<string, unknown>) ?? undefined,
            );

            // Save rendered content for audit
            await this.messageRepo.updateStatus(messageId, {
                status: 'processing',
                renderedSubject: rendered.subject,
                renderedHtml: rendered.html,
                renderedText: rendered.text,
            });

            // ─── Step 4: Send via provider ──────────────────
            const toAddrs = message.recipients
                .filter((r) => r.type === ('to' as RecipientType))
                .map((r) => ({ email: r.email, name: r.name ?? undefined }));
            const ccAddrs = message.recipients
                .filter((r) => r.type === ('cc' as RecipientType))
                .map((r) => ({ email: r.email, name: r.name ?? undefined }));
            const bccAddrs = message.recipients
                .filter((r) => r.type === ('bcc' as RecipientType))
                .map((r) => ({ email: r.email, name: r.name ?? undefined }));

            const result = await this.emailProvider.send({
                from: { email: message.fromEmail, name: message.fromName ?? undefined },
                to: toAddrs,
                cc: ccAddrs.length > 0 ? ccAddrs : undefined,
                bcc: bccAddrs.length > 0 ? bccAddrs : undefined,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
            });

            if (!result.success) {
                throw new Error(result.error || 'Provider returned failure');
            }

            // ─── Step 5: Mark as sent ───────────────────────
            await this.messageRepo.updateStatus(messageId, {
                status: 'sent',
                sentAt: new Date(),
                providerName: this.emailProvider.name,
                providerMsgId: result.providerMessageId,
            });

            await this.eventRepo.create({
                messageId,
                eventType: 'message.sent',
                payload: {
                    provider: this.emailProvider.name,
                    providerMsgId: result.providerMessageId,
                },
            });

            this.logger.log(`Message ${messageId} sent successfully`);
            return { success: true, retryable: false };
        } catch (error) {
            const err = error as Error;
            const classification = this.errorClassifier.classify(err);

            this.logger.error(
                `Message ${messageId} failed (${classification}): ${err.message}`,
            );

            if (classification === 'permanent') {
                await this.messageRepo.updateStatus(messageId, {
                    status: 'failed',
                    failedAt: new Date(),
                    errorMessage: err.message,
                });

                await this.eventRepo.create({
                    messageId,
                    eventType: 'message.failed',
                    payload: { error: err.message, classification: 'permanent' },
                });

                return { success: false, retryable: false };
            }

            // Transient: record retry event, let DLX handle it
            await this.eventRepo.create({
                messageId,
                eventType: 'message.retrying',
                payload: {
                    error: err.message,
                    classification: 'transient',
                    attempt: message.attemptCount + 1,
                },
            });

            // Revert to queued for retry
            await this.messageRepo.updateStatus(messageId, {
                status: 'queued',
                errorMessage: err.message,
            });

            return { success: false, retryable: true };
        }
    }
}
