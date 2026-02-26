import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
    private readonly logger = new Logger(CorrelationIdInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        const correlationId =
            (request.headers['x-correlation-id'] as string) || uuidv4();

        request.correlationId = correlationId;
        response.setHeader('x-correlation-id', correlationId);

        const startTime = Date.now();

        return next.handle().pipe(
            tap(() => {
                const duration = Date.now() - startTime;
                this.logger.debug(
                    `${request.method} ${request.url} [${correlationId}] ${duration}ms`,
                );
            }),
        );
    }
}
