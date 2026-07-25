import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { RegisterTagDto } from './dto/register-tag.dto';

@Controller('stellar/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * POST /api/v1/stellar/tags
   * Registers an @tag to Stellar address mapping
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  registerTag(@Body() registerTagDto: RegisterTagDto) {
    const mapping = this.tagsService.registerTag(
      registerTagDto.tag,
      registerTagDto.publicKey,
    );
    return {
      success: true,
      data: {
        tag: `@${mapping.tag}`,
        publicKey: mapping.publicKey,
        createdAt: mapping.createdAt,
      },
    };
  }

  /**
   * GET /api/v1/stellar/tags/:tag
   * Resolves a @tag to its Stellar public address
   */
  @Get(':tag')
  resolveTag(@Param('tag') tag: string) {
    const publicKey = this.tagsService.resolveTag(tag);

    if (!publicKey) {
      throw new NotFoundException(`Tag @${tag} not found`);
    }

    return {
      success: true,
      data: {
        tag: `@${tag.toLowerCase().replace(/^@/, '')}`,
        publicKey,
      },
    };
  }

  /**
   * DELETE /api/v1/stellar/tags/:tag
   * Unregisters a tag
   */
  @Delete(':tag')
  @HttpCode(HttpStatus.OK)
  unregisterTag(@Param('tag') tag: string) {
    const deleted = this.tagsService.unregisterTag(tag);

    if (!deleted) {
      throw new NotFoundException(`Tag @${tag} not found`);
    }

    return {
      success: true,
      message: `Tag @${tag.toLowerCase().replace(/^@/, '')} unregistered`,
    };
  }
}
