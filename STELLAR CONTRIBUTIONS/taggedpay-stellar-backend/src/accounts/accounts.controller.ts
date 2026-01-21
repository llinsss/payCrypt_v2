import {
    Controller,
    Post,
    Body,
    HttpCode,
    HttpStatus,
    Get,
    Param,
    NotFoundException,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountResponse } from './interfaces/account-response.interface';

@Controller('accounts')
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) { }

    /**
     * POST /api/v1/accounts
     * Creates a new Stellar account with @tag registration
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async createAccount(
        @Body() createAccountDto: CreateAccountDto,
    ): Promise<AccountResponse> {
        return this.accountsService.createAccount(createAccountDto);
    }

    /**
     * GET /api/v1/accounts/:tag
     * Gets account info by @tag (without revealing secret key)
     */
    @Get(':tag')
    async getAccountByTag(@Param('tag') tag: string): Promise<{
        success: boolean;
        data: { tag: string; publicKey: string; createdAt: Date };
    }> {
        const account = this.accountsService.getAccountByTag(tag);

        if (!account) {
            throw new NotFoundException(`Account with tag @${tag} not found`);
        }

        return {
            success: true,
            data: {
                tag: `@${account.tag}`,
                publicKey: account.publicKey,
                createdAt: account.createdAt,
            },
        };
    }

    /**
     * GET /api/v1/accounts/:tag/available
     * Checks if a tag is available
     */
    @Get(':tag/available')
    async checkTagAvailability(
        @Param('tag') tag: string,
    ): Promise<{ available: boolean; tag: string }> {
        const isAvailable = this.accountsService.isTagAvailable(tag);
        return {
            available: isAvailable,
            tag: `@${tag.toLowerCase()}`,
        };
    }
}
