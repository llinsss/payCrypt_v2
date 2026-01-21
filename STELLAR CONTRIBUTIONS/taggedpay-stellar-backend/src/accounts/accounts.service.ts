import { Injectable, ConflictException, Logger, InternalServerErrorException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountResponse } from './interfaces/account-response.interface';

// In-memory storage for tag-account mappings (for MVP)
// In production, this should be replaced with a database
interface StoredAccount {
    tag: string;
    publicKey: string;
    secretKey: string;
    createdAt: Date;
}

@Injectable()
export class AccountsService {
    private readonly logger = new Logger(AccountsService.name);
    private readonly tagMap: Map<string, StoredAccount> = new Map();

    constructor(private readonly stellarService: StellarService) { }

    /**
     * Creates a new Stellar account with the given @tag
     * @param createAccountDto The account creation parameters
     * @returns The account details including keys and balance
     */
    async createAccount(createAccountDto: CreateAccountDto): Promise<AccountResponse> {
        const { tag, initialBalance } = createAccountDto;
        const normalizedTag = tag.toLowerCase();

        // Check if tag is available
        if (!this.isTagAvailable(normalizedTag)) {
            throw new ConflictException(`Tag @${normalizedTag} is already taken`);
        }

        this.logger.log(`Creating new Stellar account for tag: @${normalizedTag}`);

        // Generate new Stellar keypair
        const { publicKey, secretKey } = this.stellarService.generateKeypair();
        this.logger.log(`Generated keypair with public key: ${publicKey}`);

        // Fund the account using Friendbot (testnet)
        const funded = await this.stellarService.fundAccount(publicKey);
        if (!funded) {
            throw new InternalServerErrorException('Failed to fund account. Please try again later.');
        }

        // Get the actual balance
        const balance = await this.stellarService.getBalance(publicKey);
        if (balance === null) {
            throw new InternalServerErrorException('Account was funded but could not verify balance.');
        }

        // Store the tag-account mapping
        const storedAccount: StoredAccount = {
            tag: normalizedTag,
            publicKey,
            secretKey,
            createdAt: new Date(),
        };
        this.tagMap.set(normalizedTag, storedAccount);

        this.logger.log(`Account created successfully for @${normalizedTag}`);

        return {
            success: true,
            data: {
                tag: `@${normalizedTag}`,
                publicKey,
                secretKey,
                balance,
            },
        };
    }

    /**
     * Checks if a tag is available
     * @param tag The tag to check (without @ prefix)
     * @returns True if the tag is available
     */
    isTagAvailable(tag: string): boolean {
        return !this.tagMap.has(tag.toLowerCase());
    }

    /**
     * Gets an account by its tag
     * @param tag The tag to look up (with or without @ prefix)
     * @returns The stored account or undefined
     */
    getAccountByTag(tag: string): StoredAccount | undefined {
        const normalizedTag = tag.replace(/^@/, '').toLowerCase();
        return this.tagMap.get(normalizedTag);
    }

    /**
     * Gets all registered accounts (for admin purposes)
     * @returns Array of all stored accounts (without secret keys)
     */
    getAllAccounts(): Array<Omit<StoredAccount, 'secretKey'>> {
        return Array.from(this.tagMap.values()).map(({ secretKey, ...rest }) => rest);
    }
}
