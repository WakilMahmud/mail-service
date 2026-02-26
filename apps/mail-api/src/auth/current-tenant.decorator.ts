import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@iep/common';

export const CurrentTenant = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): TenantContext => {
        const request = ctx.switchToHttp().getRequest();
        return request.tenant;
    },
);
