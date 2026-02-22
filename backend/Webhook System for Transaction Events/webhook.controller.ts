import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WebhookService } from '../services/webhook.service';
import { CreateWebhookDto, UpdateWebhookDto } from '../dto/webhook.dto';
// Replace with your own auth guard
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('api/webhooks')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateWebhookDto) {
    return this.webhookService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.webhookService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.webhookService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhookService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.webhookService.remove(req.user.id, id);
  }

  @Get(':id/deliveries')
  getDeliveries(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ) {
    return this.webhookService.getDeliveries(req.user.id, id, limit, offset);
  }
}
