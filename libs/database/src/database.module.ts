import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MessageRepository } from './repositories/message.repository';
import { TenantRepository } from './repositories/tenant.repository';
import { EventRepository } from './repositories/event.repository';
import { SuppressionRepository } from './repositories/suppression.repository';

@Global()
@Module({
    providers: [
        PrismaService,
        MessageRepository,
        TenantRepository,
        EventRepository,
        SuppressionRepository,
    ],
    exports: [
        PrismaService,
        MessageRepository,
        TenantRepository,
        EventRepository,
        SuppressionRepository,
    ],
})
export class DatabaseModule { }
