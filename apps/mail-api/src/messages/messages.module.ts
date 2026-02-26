import { Module } from '@nestjs/common';
import { QueueModule } from '@iep/queue';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
    imports: [QueueModule],
    controllers: [MessagesController],
    providers: [MessagesService],
})
export class MessagesModule { }
