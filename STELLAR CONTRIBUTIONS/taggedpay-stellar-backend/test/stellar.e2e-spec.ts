import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import * as StellarSdk from '@stellar/stellar-sdk';

// Increase timeout for Stellar operations
jest.setTimeout(300000); // 5 minutes

describe('Stellar Integration Tests (e2e)', () => {
    let app: INestApplication;
    const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

    // Test Accounts
    let senderKeypair: StellarSdk.Keypair;
    let receiverKeypair: StellarSdk.Keypair;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        // Generate fresh keypairs for every test run
        senderKeypair = StellarSdk.Keypair.random();
        receiverKeypair = StellarSdk.Keypair.random();

        console.log(`Sender Public Key: ${senderKeypair.publicKey()}`);
        console.log(`Receiver Public Key: ${receiverKeypair.publicKey()}`);
    });

    afterAll(async () => {
        await app.close();
    });

    it('1. Should fund accounts via Friendbot', async () => {
        // Fund Sender
        try {
            const response = await fetch(
                `https://friendbot.stellar.org?addr=${senderKeypair.publicKey()}`,
            );
            await response.json();
            expect(response.status).toBe(200);
            console.log('Sender Funded');
        } catch (e) {
            console.error('Friendbot failed for sender', e);
            throw e;
        }

        // Fund Receiver
        try {
            const response = await fetch(
                `https://friendbot.stellar.org?addr=${receiverKeypair.publicKey()}`,
            );
            await response.json();
            expect(response.status).toBe(200);
            console.log('Receiver Funded');
        } catch (e) {
            console.error('Friendbot failed for receiver', e);
            throw e;
        }

        // Verify Balances
        const senderAccount = await server.loadAccount(senderKeypair.publicKey());
        const receiverAccount = await server.loadAccount(receiverKeypair.publicKey());

        expect(parseFloat(senderAccount.balances[0].balance)).toBeGreaterThan(0);
        expect(parseFloat(receiverAccount.balances[0].balance)).toBeGreaterThan(0);
    });

    it('2. Should complete payment flow (Sender -> Receiver)', async () => {
        const amountToSend = '10';

        const sourceAccount = await server.loadAccount(senderKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(
                StellarSdk.Operation.payment({
                    destination: receiverKeypair.publicKey(),
                    asset: StellarSdk.Asset.native(),
                    amount: amountToSend,
                }),
            )
            .setTimeout(StellarSdk.TimeoutInfinite)
            .build();

        transaction.sign(senderKeypair);

        try {
            const result = await server.submitTransaction(transaction);
            expect(result.successful).toBe(true);
            console.log('Payment Successful', result.hash);

            // Verify Balances Updated
            const receiverAccount = await server.loadAccount(receiverKeypair.publicKey());
            expect(parseFloat(receiverAccount.balances[0].balance)).toBeGreaterThan(10005);
        } catch (e: any) {
            console.error('Payment failed', e?.response?.data?.extras?.result_codes || e);
            throw e;
        }
    });

    it('3. Should verify transaction history', async () => {
        // Fetch transactions for Sender
        const transactions = await server
            .transactions()
            .forAccount(senderKeypair.publicKey())
            .limit(1)
            .order('desc')
            .call();

        expect(transactions.records.length).toBeGreaterThan(0);
        const latestTx = transactions.records[0];

        expect(latestTx.successful).toBe(true);
        expect(latestTx.source_account).toBeDefined();
    });

    it('4. Should handle error for invalid operations (insufficient funds)', async () => {
        const hugeAmount = '1000000000'; // More than Friendbot provides
        const tempKeypair = StellarSdk.Keypair.random();

        // Fund a temporary small account
        await fetch(`https://friendbot.stellar.org?addr=${tempKeypair.publicKey()}`);
        const sourceAccount = await server.loadAccount(tempKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(
                StellarSdk.Operation.payment({
                    destination: receiverKeypair.publicKey(),
                    asset: StellarSdk.Asset.native(),
                    amount: hugeAmount,
                }),
            )
            .setTimeout(StellarSdk.TimeoutInfinite)
            .build();

        transaction.sign(tempKeypair);

        try {
            await server.submitTransaction(transaction);
            throw new Error('Transaction should have failed with op_underfunded');
        } catch (e: any) {
            const resultCodes = e.response?.data?.extras?.result_codes;
            expect(resultCodes.operations).toContain('op_underfunded');
            console.log('Error Handling Verified: op_underfunded');
        }

        // Cleanup temp account
        const mergeTx = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(
                StellarSdk.Operation.accountMerge({
                    destination: receiverKeypair.publicKey(),
                }),
            )
            .setTimeout(StellarSdk.TimeoutInfinite)
            .build();
        mergeTx.sign(tempKeypair);
        await server.submitTransaction(mergeTx);
    });

    it('5. Should handle cleanup (Merge Account)', async () => {
        // Merge Sender into Receiver to empty Sender account
        const sourceAccount = await server.loadAccount(senderKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(
                StellarSdk.Operation.accountMerge({
                    destination: receiverKeypair.publicKey(),
                }),
            )
            .setTimeout(StellarSdk.TimeoutInfinite)
            .build();

        transaction.sign(senderKeypair);

        const result = await server.submitTransaction(transaction);
        expect(result.successful).toBe(true);
        console.log('Account Merged (Cleanup)');

        // Verify Sender is gone (or empty/inactive)
        try {
            await server.loadAccount(senderKeypair.publicKey());
            throw new Error('Sender account should be merged/inactive');
        } catch (e: any) {
            expect(e.response.status).toBe(404);
        }
    });
});
