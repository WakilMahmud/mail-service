import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

class RecipientResponseDto {
    @ApiProperty()
    @Expose()
    type!: string;

    @ApiProperty()
    @Expose()
    email!: string;

    @ApiPropertyOptional()
    @Expose()
    name?: string;
}

class EventResponseDto {
    @ApiProperty()
    @Expose()
    eventType!: string;

    @ApiPropertyOptional()
    @Expose()
    payload?: Record<string, unknown>;

    @ApiProperty()
    @Expose()
    createdAt!: Date;
}

@Exclude()
export class MessageResponseDto {
    @ApiProperty()
    @Expose()
    id!: string;

    @ApiProperty()
    @Expose()
    status!: string;

    @ApiProperty()
    @Expose()
    priority!: string;

    @ApiProperty()
    @Expose()
    fromEmail!: string;

    @ApiPropertyOptional()
    @Expose()
    fromName?: string;

    @ApiProperty()
    @Expose()
    subject!: string;

    @ApiProperty()
    @Expose()
    @Type(() => RecipientResponseDto)
    recipients!: RecipientResponseDto[];

    @ApiPropertyOptional()
    @Expose()
    providerName?: string;

    @ApiProperty()
    @Expose()
    attemptCount!: number;

    @ApiPropertyOptional()
    @Expose()
    sentAt?: Date;

    @ApiPropertyOptional()
    @Expose()
    failedAt?: Date;

    @ApiPropertyOptional()
    @Expose()
    errorMessage?: string;

    @ApiProperty()
    @Expose()
    @Type(() => EventResponseDto)
    events!: EventResponseDto[];

    @ApiProperty()
    @Expose()
    createdAt!: Date;

    @ApiProperty()
    @Expose()
    updatedAt!: Date;
}
