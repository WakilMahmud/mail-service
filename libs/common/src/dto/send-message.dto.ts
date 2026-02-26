import {
    IsArray,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Nested DTOs ─────────────────────────────────────────

export class EmailAddressDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiPropertyOptional({ example: 'John Doe' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;
}

// ─── Send Message DTO ────────────────────────────────────

export class SendMessageDto {
    @ApiProperty({ description: 'Sender address', type: EmailAddressDto })
    @ValidateNested()
    @Type(() => EmailAddressDto)
    @IsNotEmpty()
    from!: EmailAddressDto;

    @ApiProperty({ description: 'TO recipients', type: [EmailAddressDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EmailAddressDto)
    @IsNotEmpty()
    to!: EmailAddressDto[];

    @ApiPropertyOptional({ description: 'CC recipients', type: [EmailAddressDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EmailAddressDto)
    cc?: EmailAddressDto[];

    @ApiPropertyOptional({ description: 'BCC recipients', type: [EmailAddressDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EmailAddressDto)
    bcc?: EmailAddressDto[];

    @ApiProperty({ example: 'Welcome, {{name}}!' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(998)
    subject!: string;

    @ApiProperty({ example: '<h1>Hello {{name}}</h1>' })
    @IsString()
    @IsNotEmpty()
    htmlBody!: string;

    @ApiPropertyOptional({ example: 'Hello {{name}}' })
    @IsOptional()
    @IsString()
    textBody?: string;

    @ApiPropertyOptional({ example: { name: 'Wakil' } })
    @IsOptional()
    @IsObject()
    variables?: Record<string, unknown>;

    @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'critical'], default: 'normal' })
    @IsOptional()
    @IsEnum(['low', 'normal', 'high', 'critical'])
    priority?: 'low' | 'normal' | 'high' | 'critical';

    @ApiProperty({ description: 'Unique key for idempotency', example: 'a1b2c3d4-...' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    idempotencyKey!: string;
}
