import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantRepository {
    constructor(private readonly prisma: PrismaService) { }

    async findByApiKeyHash(apiKeyHash: string): Promise<Tenant | null> {
        return this.prisma.tenant.findUnique({
            where: { apiKeyHash },
        });
    }

    async findById(id: string): Promise<Tenant | null> {
        return this.prisma.tenant.findUnique({
            where: { id },
        });
    }

    async create(data: {
        name: string;
        apiKeyHash: string;
        rateLimitPerSec?: number;
    }): Promise<Tenant> {
        return this.prisma.tenant.create({ data });
    }
}
