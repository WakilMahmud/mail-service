import {
    Injectable,
    CanActivate,
    ExecutionContext,
    Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantRepository } from '@iep/database';
import { TenantNotFoundException, TenantContext } from '@iep/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);

    constructor(private readonly tenantRepo: TenantRepository) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'] as string | undefined;

        if (!apiKey) {
            throw new TenantNotFoundException();
        }

        const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
        const tenant = await this.tenantRepo.findByApiKeyHash(apiKeyHash);

        if (!tenant || !tenant.isActive) {
            throw new TenantNotFoundException();
        }

        // Attach tenant context to request for downstream use
        const tenantContext: TenantContext = {
            tenantId: tenant.id,
            tenantName: tenant.name,
            rateLimitPerSec: tenant.rateLimitPerSec,
        };
        request.tenant = tenantContext;

        this.logger.debug(`Authenticated tenant: ${tenant.name}`);
        return true;
    }
}
