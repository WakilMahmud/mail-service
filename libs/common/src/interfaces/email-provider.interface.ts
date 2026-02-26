export interface EmailProviderSendOptions {
    from: { email: string; name?: string };
    to: { email: string; name?: string }[];
    cc?: { email: string; name?: string }[];
    bcc?: { email: string; name?: string }[];
    subject: string;
    html: string;
    text?: string;
    attachments?: {
        filename: string;
        content: Buffer;
        contentType: string;
    }[];
}

export interface EmailProviderResponse {
    success: boolean;
    providerMessageId?: string;
    error?: string;
}

export interface IEmailProvider {
    readonly name: string;
    send(options: EmailProviderSendOptions): Promise<EmailProviderResponse>;
    validateConnection(): Promise<boolean>;
}
