import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getStellarConfig } from '../config/stellar.config';

@Injectable()
export class StellarService {
    private logger = new Logger(StellarService.name);
    private readonly server: StellarSdk.Horizon.Server;
    private readonly networkPassphrase: string;
    private readonly network: 'testnet' | 'mainnet';
    private readonly friendbotUrl: string | null;

    // CHANGE: Injected ConfigService to support dynamic network configuration
    constructor(private readonly configService: ConfigService) {
        this.network = (this.configService.get<string>('stellar.network') || 'testnet') as 'testnet' | 'mainnet';
        const config = getStellarConfig(this.network);
        
        this.server = new StellarSdk.Horizon.Server(config.horizonUrl);
        this.networkPassphrase = config.networkPassphrase;
        this.friendbotUrl = config.friendbotUrl;
        
        this.logger.log(`Stellar Service initialized with ${this.network} network`);
    }

    /**
     * Generates a new Stellar keypair
     * @returns Object containing publicKey and secretKey
     */
    generateKeypair(): { publicKey: string; secretKey: string } {
        const keypair = StellarSdk.Keypair.random();
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
                    StellarSdk.Operation.payment({
                        destination: destinationPublic,
                        asset: StellarSdk.Asset.native(),
                        amount: amount,
                    }),
                )
                .setTimeout(StellarSdk.TimeoutInfinite)
                .build();

            transaction.sign(sourceKeypair);

            const result = await this.server.submitTransaction(transaction);
            this.logger.log(`Payment sent successfully. Hash: ${result.hash}`);
            return result.hash;
        } catch (error) {
            // CHANGE: Improved error handling for network failures
            if (error instanceof StellarSdk.NetworkError) {
                this.logger.error(`Network error during payment: ${error.message}`);
            } else if (error instanceof Error) {
                this.logger.error(`Payment failed: ${error.message}`);
            } else {
                this.logger.error(`Unknown error during payment`);
            }
            throw error;
        }
    }
}
