import { Module } from '@nestjs/common';
import { QueueModule } from '@iep/queue';
import { RenderingModule } from '@iep/rendering';
import { ProvidersModule } from '@iep/providers';
import { ConsumerService } from './consumer.service';
import { ProcessingService } from './processing.service';
import { ErrorClassifierService } from './error-classifier.service';

@Module({
    imports: [QueueModule, RenderingModule, ProvidersModule],
    providers: [ConsumerService, ProcessingService, ErrorClassifierService],
})
export class ConsumerModule { }
