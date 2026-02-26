import { Injectable, Logger } from '@nestjs/common';
import { MessageRepository, EventRepository } from '@iep/database';
import { QueueService } from '@iep/queue';
import {
    SendMessageDto,
    TenantContext,
    MessageNotFoundException,
} from '@iep/common';
import { MessageStatus, Prisma } from '@prisma/client';

@Injectable()
export class MessagesService {
    private readonly logger = new Logger(MessagesService.name);

    constructor(
        private readonly messageRepo: MessageRepository,
        private readonly eventRepo: EventRepository,
        private readonly queueService: QueueService,
    ) { }

    async create(tenant: TenantContext, dto: SendMessageDto) {
        // ─── Idempotency Check ──────────────────────────
        const existing = await this.messageRepo.findByIdempotencyKey(
            tenant.tenantId,
            dto.idempotencyKey,
        );

        if (existing) {
            this.logger.debug(
                `Idempotent hit: message ${existing.id} for key ${dto.idempotencyKey}`,
            );
            return {
                statusCode: 200,
                message: 'Message already created with this idempotency key',
                data: {
                    id: existing.id,
                    status: existing.status,
                    createdAt: existing.createdAt,
                },
            };
        }

        // ─── Create Message ─────────────────────────────
        const message = await this.messageRepo.create({
            tenant: { connect: { id: tenant.tenantId } },
            idempotencyKey: dto.idempotencyKey,
            fromEmail: dto.from.email,
            fromName: dto.from.name,
            subject: dto.subject,
            htmlBody: dto.htmlBody,
            textBody: dto.textBody,
            variables: dto.variables as Prisma.InputJsonValue,
            priority: (dto.priority as any) || 'normal',
            status: 'queued',
            recipients: {
                create: [
                    ...dto.to.map((r) => ({
                        type: 'to' as const,
                        email: r.email,
                        name: r.name,
                    })),
                    ...(dto.cc?.map((r) => ({
                        type: 'cc' as const,
                        email: r.email,
                        name: r.name,
                    })) || []),
                    ...(dto.bcc?.map((r) => ({
                        type: 'bcc' as const,
                        email: r.email,
                        name: r.name,
                    })) || []),
                ],
            },
        });

        // ─── Record Event ───────────────────────────────
        await this.eventRepo.create({
            messageId: message.id,
            eventType: 'message.queued',
            payload: {
                tenantId: tenant.tenantId,
                priority: dto.priority || 'normal',
            },
        });

        // ─── Publish to Queue ───────────────────────────
        await this.queueService.publish(message.id, dto.priority);

        this.logger.log(`Message ${message.id} queued for delivery`);

        return {
            statusCode: 202,
            message: 'Message accepted for delivery',
            data: {
                id: message.id,
                status: message.status,
                createdAt: message.createdAt,
            },
        };
    }

    async findById(tenantId: string, id: string) {
        const message = await this.messageRepo.findById(id, tenantId);

        if (!message) {
            throw new MessageNotFoundException(id);
        }

        return {
            id: message.id,
            status: message.status,
            priority: message.priority,
            fromEmail: message.fromEmail,
            fromName: message.fromName,
            subject: message.subject,
            recipients: message.recipients,
            providerName: message.providerName,
            attemptCount: message.attemptCount,
            sentAt: message.sentAt,
            failedAt: message.failedAt,
            errorMessage: message.errorMessage,
            events: message.events,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
        };
    }

    async findMany(
        tenantId: string,
        options: { status?: MessageStatus; page?: number; limit?: number },
    ) {
        return this.messageRepo.findMany(tenantId, options);
    }
}
