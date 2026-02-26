import { Module } from '@nestjs/common';
import { SmtpProvider } from './smtp/smtp.provider';
import { EMAIL_PROVIDER } from '@iep/common';

@Module({
    providers: [
        {
            provide: EMAIL_PROVIDER,
            useClass: SmtpProvider,
        },
    ],
    exports: [EMAIL_PROVIDER],
})
export class ProvidersModule { }
