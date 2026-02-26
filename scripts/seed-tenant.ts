/**
 * Seed script to create a test tenant with a known API key.
 *
 * Usage: npx ts-node scripts/seed-tenant.ts
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
    const apiKey = 'iep-dev-api-key-12345';
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const tenant = await prisma.tenant.upsert({
        where: { apiKeyHash },
        update: {},
        create: {
            name: 'Development Tenant',
            apiKeyHash,
            rateLimitPerSec: 100,
            isActive: true,
        },
    });

    console.log('──────────────────────────────────────');
    console.log('🏢 Tenant seeded successfully');
    console.log(`   ID:      ${tenant.id}`);
    console.log(`   Name:    ${tenant.name}`);
    console.log(`   API Key: ${apiKey}`);
    console.log('──────────────────────────────────────');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
