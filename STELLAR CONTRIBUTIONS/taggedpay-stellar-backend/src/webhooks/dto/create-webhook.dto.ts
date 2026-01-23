import {
    IsString,
    IsUrl,
    IsArray,
    IsEnum,
    IsOptional,
    ArrayMinSize,
} from 'class-validator';
import { WebhookEventType } from '../interfaces/webhook-event.interface';

export class CreateWebhookDto {
    @IsString()
    accountTag: string;

    @IsUrl({}, { message: 'Please provide a valid URL' })
    url: string;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one event type must be specified' })
    @IsEnum(WebhookEventType, {
        each: true,
        message: 'Invalid event type',
    })
    events: WebhookEventType[];

    @IsOptional()
    @IsString()
    secret?: string;
}
