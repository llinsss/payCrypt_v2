import { Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { stellarConfig } from '../config/stellar.config';

@Injectable()
export class StellarService {
    private readonly logger = new Logger(StellarService.name);
    private readonly server: StellarSdk.Horizon.Server;

    constructor() {
        this.server = new StellarSdk.Horizon.Server(stellarConfig.horizonUrl);
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
     * @param publicKey The public key of the account to fund
     * @returns True if funding was successful
     */
    async fundAccount(publicKey: string): Promise<boolean> {
        try {
            this.logger.log(`Funding account ${publicKey} via Friendbot...`);

            const response = await fetch(
                `${stellarConfig.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`
            );

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Friendbot error: ${errorText}`);
                return false;
            }

            const result = await response.json();
            this.logger.log(`Account funded successfully. Transaction hash: ${result.hash}`);
            return true;
        } catch (error) {
            this.logger.error(`Error funding account: ${error.message}`);
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

            const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.TESTNET,
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
            return result.hash;
        } catch (error) {
            this.logger.error(`Payment failed: ${error.message}`);
            throw error;
        }
    }
}
