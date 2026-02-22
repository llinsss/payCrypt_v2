import {
  IsUrl,
  IsArray,
  ArrayMinSize,
  IsIn,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { WebhookEvent } from '../models/webhook.entity';

const VALID_EVENTS: WebhookEvent[] = [
  'transaction.created',
  'transaction.completed',
  'transaction.failed',
];

export class CreateWebhookDto {
  @IsUrl({ require_tld: true, protocols: ['http', 'https'] })
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(VALID_EVENTS, { each: true })
  events: WebhookEvent[];

  @IsOptional()
  @IsString()
  @MinLength(16)
  secret?: string;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['http', 'https'] })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(VALID_EVENTS, { each: true })
  events?: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
