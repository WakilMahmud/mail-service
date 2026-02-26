import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type {
    IEmailProvider,
    EmailProviderSendOptions,
    EmailProviderResponse,
} from '@iep/common';

@Injectable()
export class SmtpProvider implements IEmailProvider {
    readonly name = 'smtp';
    private readonly logger = new Logger(SmtpProvider.name);
    private transporter!: Transporter;

    constructor(private readonly configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('smtp.host'),
            port: this.configService.get<number>('smtp.port'),
            secure: this.configService.get<boolean>('smtp.secure'),
            auth: this.configService.get('smtp.auth'),
        });
    }

    async send(options: EmailProviderSendOptions): Promise<EmailProviderResponse> {
        try {
            const info = await this.transporter.sendMail({
                from: options.from.name
                    ? `"${options.from.name}" <${options.from.email}>`
                    : options.from.email,
                to: options.to.map((r) =>
                    r.name ? `"${r.name}" <${r.email}>` : r.email,
                ),
                cc: options.cc?.map((r) =>
                    r.name ? `"${r.name}" <${r.email}>` : r.email,
                ),
                bcc: options.bcc?.map((r) =>
                    r.name ? `"${r.name}" <${r.email}>` : r.email,
                ),
                subject: options.subject,
                html: options.html,
                text: options.text,
                attachments: options.attachments?.map((a) => ({
                    filename: a.filename,
                    content: a.content,
                    contentType: a.contentType,
                })),
            });

            this.logger.debug(`Email sent via SMTP: ${info.messageId}`);

            return {
                success: true,
                providerMessageId: info.messageId,
            };
        } catch (error) {
            const errMsg = (error as Error).message;
            this.logger.error(`SMTP send failed: ${errMsg}`);

            return {
                success: false,
                error: errMsg,
            };
        }
    }

    async validateConnection(): Promise<boolean> {
        try {
            await this.transporter.verify();
            return true;
        } catch {
            return false;
        }
    }
}
