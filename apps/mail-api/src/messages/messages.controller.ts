import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
    ParseUUIDPipe,
    Logger,
} from '@nestjs/common';
import {
    ApiTags,
    ApiSecurity,
    ApiOperation,
    ApiResponse,
    ApiQuery,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { SendMessageDto, TenantContext, MessageResponseDto } from '@iep/common';
import { MessagesService } from './messages.service';

@ApiTags('Messages')
@ApiSecurity('api-key')
@Controller({ path: 'messages', version: '1' })
@UseGuards(ApiKeyGuard)
export class MessagesController {
    private readonly logger = new Logger(MessagesController.name);

    constructor(private readonly messagesService: MessagesService) { }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Send an email message' })
    @ApiResponse({ status: 202, description: 'Message accepted for delivery' })
    @ApiResponse({ status: 200, description: 'Idempotent duplicate — message already exists' })
    @ApiResponse({ status: 400, description: 'Validation error' })
    @ApiResponse({ status: 401, description: 'Invalid API key' })
    async sendMessage(
        @CurrentTenant() tenant: TenantContext,
        @Body() dto: SendMessageDto,
    ) {
        this.logger.log(
            `Received message from tenant ${tenant.tenantName} with key ${dto.idempotencyKey}`,
        );

        const result = await this.messagesService.create(tenant, dto);
        return result;
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get message status' })
    @ApiResponse({ status: 200, description: 'Message details' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    async getMessage(
        @CurrentTenant() tenant: TenantContext,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.messagesService.findById(tenant.tenantId, id);
    }

    @Get()
    @ApiOperation({ summary: 'List messages' })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async listMessages(
        @CurrentTenant() tenant: TenantContext,
        @Query('status') status?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.messagesService.findMany(tenant.tenantId, {
            status: status as any,
            page,
            limit,
        });
    }
}
