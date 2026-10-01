import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSck from '@stellar/stellar-sdk';
import { getStellarConfig } from '../config/stellar.config';

/**
 * Trust boundary for token contract allowlisting.
 *
 * The backend is the only privileged actor allowed to call the contract's allowlist
 * entrypoint. The contract is trusted to enforce authorization and to reject
 * replayed or malformed invocations. The backend validates the contract's
 * observable behavior before adding an asset to its own allowlist.
 */
export interface TokenContractBehavior {
    /** Contract address that was probed. */
    contractId: string;
    /** True when the contract exposes the expected token interface. */
    hasTokenInterface: boolean;
    /** True when the contract reports a non-empty name. */
    hasName: boolean;
    /** True when the contract reports a non-empty symbol. */
    hasCurrency: boolean;
    /** True when the contract reports a valid decimals value. */
    hasDecimals: boolean;
    /** True when the contract rejects unauthorized mutations. */
    rejectsUnauthorized: boolean;
    /** True when a replayed invocation is rejected. */
    rejectsReplay: boolean;
    /** True when failure paths leave state unchanged. */
    failureSafe: boolean;
    /** Deterministic digest of the observed behavior. */
    digest: string;
}

export interface AllowlistValidationResult {
    approved: boolean;
    reason: string;
    behavior: TokenContractBehavior | null;
}

export class TokenContractValidationError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'TokenContractValidationError';
    }
}

@Injectable()
export class StellarService {
    private logger = new Logger(StellarService.name);
    private readonly server: StellarSck.Horizon.Server;
    private readonly networkPassphrase: string;
    private readonly network: 'testnet' | 'mainnet';
    private readonly friendbotUrl: string | null;
    private readonly allowlistedContracts: Map<string, TokenContractBehavior> = new Map();
    private readonly seenDigests: Set<string> = new Set();

    // CHANGE: Injected ConfigService to support dynamic network configuration
    constructor(private readonly configService: ConfigService) {
        this.network = (this.configService.get<string>('stellar.network') || 'testnet') as 'testnet' | 'mainnet';
        const config = getStellarConfig(this.network);

        this.server = new StellarSck.Horizon.Server(config.horizonUrl);
        this.networkPassphrase = config.networkPassphrase;
        this.friendbotUrl = config.friendbotUrl;

        this.logger.log(`Stellar Service initialized with ${this.network} network`);
    }

    /**
     * Generates a new Stellar keypair
     * @returns Object containing publicKey and secretKey
     */
    generateKeypair(): { publicKey: string; secretKey: string } {
        const keypair = StellarSck.Keypair.random();
        return {
            publicKey: keypair.publicKey(),
            secretKey: keypair.secret(),
        };
    }

    /**
     * Funds an account using Stellar Friendbot (testnet only)
     * CHANGE: Added validation for mainnet, improved error handling for network failures
     * @param publicKey The public key of the account to fund
     * @returns True if funding was successful
     */
    async fundAccount(publicKey: string): Promise<boolean> {
        try {
            // CHANGE: Added check to prevent funding on mainnet
            if (this.network === 'mainnet') {
                this.logger.error('Friendbot is not available on mainnet. Please fund the account manually.');
                return false;
            }

            if (!this.friendbotUrl) {
                this.logger.error('Friendbot URL is not configured for this network.');
                return false;
            }

            this.logger.log(`Funding account ${publicKey} via Friendbot on ${this.network}...`);

            // CHANGE: Added timeout for network requests to handle connection failures
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(
                `${this.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`,
                { signal: controller.signal }
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Friendbot error (${response.status}): ${errorText}`);
                return false;
            }

            const result = await response.json();
            this.logger.log(`Account funded successfully. Transaction hash: ${result.hash}`);
            return true;
        } catch (error) {
            // CHANGE: Improved error handling to distinguish network failures from other errors
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    this.logger.error(`Friendbot request timeout: Network operation took too long`);
                } else {
                    this.logger.error(`Error funding account: ${error.message}`);
                }
            } else {
                this.logger.error(`Unknown error funding account`);
            }
            return false;
        }
    }

    /**
     * Gets the balance of a Stellar account
     * @param publicKey The public key of the account
     * @returns The XLM balance as a string, or null if account doesn't exist
     */
    async getBalance(publicKey: string): Promise<string | null> {
        try {
            const account = await this.server.loadAccount(publicKey);
            const xlmBalance = account.balances.find(
                (balance) => balance.asset_type === 'native'
            );
            return xlmBalance ? xlmBalance.balance : '0';
        } catch (error) {
            if (error instanceof StellarSdk.NotFoundError) {
                this.logger.warn(`Account ${publicKey} not found on network`);
                return null;
            }
            this.logger.error(`Error getting balance: ${error.message}`);
            throw error;
        }
    }

    /**
     * Checks if an account exists on the Stellar network
     * @param publicKey The public key to check
     * @returns True if the account exists
     */
    async accountExists(publicKey: string): Promise<boolean> {
        try {
            await this.server.loadAccount(publicKey);
            return true;
        } catch (error) {
            if (error instanceof StellarSdk.NotFoundError) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Sends XLM from one account to another
     * CHANGE: Updated to use dynamic network passphrase instead of hardcoded TESTNET
     * @param sourceSecret The secret key of the sender
     * @param destinationPublic The public key of the receiver
     * @param amount The amount of XLM to send
     * @returns The transaction result hash
     */
    async sendPayment(
        sourceSecret: string,
        destinationPublic: string,
        amount: string,
    ): Promise<string> {
        try {
            const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);
            const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

            // CHANGE: Using dynamic networkPassphrase from configuration instead of hardcoded TESTNET
            const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(
                    StellarSck.Operation.payment({
                        destination: destinationPublic,
                        asset: StellarSdk.Asset.native(),
                        amount: amount,
                    }),
                )
                .setTimeout(StellarSck.TimeoutInfinite)
                .build();

            transaction.sign(sourceKeypair);

            const result = await this.server.submitTransaction(transaction);
            this.logger.log(`Payment sent successfully. Hash: ${result.hash}`);
            return result.hash;
        } catch (error) {
            // CHANGE: Improved error handling for network failures
            if (error instanceof StellarSck.NetworkError) {
                this.logger.error(`Network error during payment: ${error.message}`);
            } else if (error instanceof Error) {
                this.logger.error(`Payment failed: ${error.message}`);
            } else {
                this.logger.error(`Unknown error during payment`);
            }
            throw error;
        }
    }

    /**
     * Deterministically validates a token contract's behavior before allowlisting it.
     *
     * The check is pure and deterministic: given the same observed behavior it
     * always returns the same result. Replayed digests are rejected so an
     * allowlisted contract cannot be re-validated with stale data.
     */
    validateTokenContractBehavior(
        contractId: string,
        behavior: TokenContractBehavior,
    ): AllowlistValidationResult {
        if (!contractId || contractId.trim().length === 0) {
            throw new TokenContractValidationError('INVALID_CONTRACT_ID', 'contractId must be a non-empty string');
        }

        if (behavior.contractId !== contractId) {
            throw new TokenContractValidationError(
                'CONTRACT_ID_MISMATCH',
                `Behavior contractId ${behavior.contractId} does not match ${contractId}`,
            );
        }

        if (this.seenDigests.has(behavior.digest)) {
            this.logger.warn(`Replay detected for digest ${behavior.digest} on ${contractId}`);
            return {
                approved: false,
                reason: 'REPLAY_DETECTED',
                behavior,
            };
            }

        const failures: string[] = [];
        if (!behavior.hasTokenInterface) failures.push('MISSING_TOKEN_INTERFACE');
        if (!behavior.hasName) failures.push('MISSING_NAME');
        if (!behavior.hasCurrency) failures.push('MISSING_CURRENCY');
        if (!behavior.hasDecimals) failures.push('MISSING_DECIMALS');
        if (!behavior.rejectsUnauthorized) failures.push('ACCEPTS_UNAUTHORIZED');
        if (!behavior.rejectsReplay) failures.push('ACCEPTS_REPLAY');
        if (!behavior.failureSafe) failures.push('NON_FAILURE_SAFE');

        if (failures.length > 0) {
            this.logger.warn(`Token contract ${contractId} rejected: ${failures.join(',')}`);
            return {
                approved: false,
                reason: failures.join(','),
                behavior,
            };
        }

        this.seenDigests.add(behavior.digest);
        this.allowlistedContracts.set(contractId, behavior);
        this.logger.log(`Token contract ${contractId} approved for allowlisting`);
        return { approved: true, reason: 'OK', behavior };
    }

    /**
     * Returns the allowlisted behavior for a contract, or null if not allowlisted.
     */
    getAllowlistedBehavior(contractId: string): TokenContractBehavior | null {
        return this.allowlistedContracts.get(contractId) ?? null;
    }

    /**
     * Resets the allowlist and replay guard. Used by rollback and tests.
     */
    resetAllowlist(): void {
        this.allowlistedContracts.clear();
        this.seenDigests.clear();
    }
}
