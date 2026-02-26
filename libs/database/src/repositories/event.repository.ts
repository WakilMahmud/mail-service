import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class EventRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(data: {
        messageId: string;
        eventType: string;
        payload?: Record<string, unknown>;
    }) {
        return this.prisma.messageEvent.create({
            data: {
                messageId: data.messageId,
                eventType: data.eventType,
                payload: data.payload ?? undefined,
            } as any,
        });
    }

    async findByMessageId(messageId: string) {
        return this.prisma.messageEvent.findMany({
            where: { messageId },
            orderBy: { createdAt: 'asc' },
        });
    }
}
