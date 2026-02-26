import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SuppressionRepository {
    constructor(private readonly prisma: PrismaService) { }

    async isSuppressed(tenantId: string, email: string): Promise<boolean> {
        const entry = await this.prisma.suppressionEntry.findUnique({
            where: {
                tenantId_email: { tenantId, email },
            },
        });
        return !!entry;
    }

    async add(tenantId: string, email: string, reason: string) {
        return this.prisma.suppressionEntry.upsert({
            where: {
                tenantId_email: { tenantId, email },
            },
            update: { reason },
            create: { tenantId, email, reason },
        });
    }

    async remove(tenantId: string, email: string) {
        return this.prisma.suppressionEntry.deleteMany({
            where: { tenantId, email },
        });
    }
}
