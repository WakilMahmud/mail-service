import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma, Message, MessageStatus } from '@prisma/client';

@Injectable()
export class MessageRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(data: Prisma.MessageCreateInput): Promise<Message> {
        return this.prisma.message.create({ data });
    }

    async findById(
        id: string,
        tenantId: string,
    ): Promise<
        | (Message & {
            recipients: { type: string; email: string; name: string | null }[];
            events: { eventType: string; payload: unknown; createdAt: Date }[];
        })
        | null
    > {
        return this.prisma.message.findFirst({
            where: { id, tenantId },
            include: {
                recipients: {
                    select: { type: true, email: true, name: true },
                },
                events: {
                    select: { eventType: true, payload: true, createdAt: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
    }

    async findByIdempotencyKey(
        tenantId: string,
        idempotencyKey: string,
    ): Promise<Message | null> {
        return this.prisma.message.findUnique({
            where: {
                tenantId_idempotencyKey: {
                    tenantId,
                    idempotencyKey,
                },
            },
        });
    }

    async findByIdInternal(id: string): Promise<
        | (Message & {
            recipients: { type: string; email: string; name: string | null }[];
            attachments: {
                filename: string;
                mimeType: string;
                sizeBytes: number;
                s3Key: string;
            }[];
            tenant: { id: string; name: string };
        })
        | null
    > {
        return this.prisma.message.findUnique({
            where: { id },
            include: {
                recipients: {
                    select: { type: true, email: true, name: true },
                },
                attachments: {
                    select: {
                        filename: true,
                        mimeType: true,
                        sizeBytes: true,
                        s3Key: true,
                    },
                },
                tenant: {
                    select: { id: true, name: true },
                },
            },
        });
    }

    async updateStatus(
        id: string,
        data: {
            status: MessageStatus;
            attemptCount?: number;
            lastAttemptAt?: Date;
            sentAt?: Date;
            failedAt?: Date;
            errorMessage?: string;
            providerName?: string;
            providerMsgId?: string;
            renderedSubject?: string;
            renderedHtml?: string;
            renderedText?: string;
        },
    ): Promise<Message> {
        return this.prisma.message.update({
            where: { id },
            data,
        });
    }

    async findMany(
        tenantId: string,
        options: {
            status?: MessageStatus;
            page?: number;
            limit?: number;
        } = {},
    ) {
        const { status, page = 1, limit = 20 } = options;
        const where: Prisma.MessageWhereInput = { tenantId };
        if (status) where.status = status;

        const [items, total] = await this.prisma.$transaction([
            this.prisma.message.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    recipients: {
                        select: { type: true, email: true, name: true },
                    },
                },
            }),
            this.prisma.message.count({ where }),
        ]);

        return {
            items,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }
}
