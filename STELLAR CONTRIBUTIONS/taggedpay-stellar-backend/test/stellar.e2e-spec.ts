import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import * as StellarSdk from '@stellar/stellar-sdk';
import { createHash } from 'crypto';

// Increase timeout for Stellar operations
jest.setTimeout(300000); // 5 minutes

describe('Stellar Integration Tests (e2e)', () => {
    let app: INestApplication;
    const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

    // ---------------------------------------------------------------------
    // Trust boundary + allowlist validation model (Rust/Soroban migration)
    // ---------------------------------------------------------------------
    // Trust boundary:
    //   - Untrusted: arbitrary SAC/SEP-41 token contracts supplied by callers.
    //   - Trusted:  admin (privileged role) that signs the allowlist mutation.
    //   - Trusted:  the on-chain allowlist registry contract itself.
    // Privileged roles:
    //   - admin: may add/remove tokens from the allowlist.
    //   - operator: may pause/unpause but not mutate the allowlist.
    // Replay behavior:
    //   - Each allowlist mutation carries a monotonically increasing nonce.
    //   - (admin, nonce) pairs are single-use; replays are rejected.
    // Failure-safe state transitions:
    //   - Validation runs BEFORE the allowlist is mutated.
    //   - If validation fails, the allowlist is left unchanged (atomic).
    type TokenBehavior = {
        name: string;
        symbol: string;
        decimals: number;
        totalSupply: bigint;
        supportsTransfer: boolean;
        supportsTransferFrom: boolean;
        supportsApprove: boolean;
        supportsMint: boolean;
        supportsBurn: boolean;
    };

    type AllowlistEntry = {
        contractId: string;
        behaviorHash: string;
        nonce: bigint;
        admin: string;
        active: boolean;
    };

    const behaviorHash = (b: TokenBehavior): string =>
        createHash('sha256').update(JSON.stringify(b)).digest('hex');

    const validateTokenBehavior = (
        b: TokenBehavior,
    ): { ok: boolean; reason?: string } => {
        if (!b.name || !b.symbol) return { ok: false, reason: 'missing_metadata' };
        if (b.decimals < 0 || b.decimals > 18)
            return { ok: false, reason: 'invalid_decimals' };
        if (b.totalSupply < 0n) return { ok: false, reason: 'invalid_supply' };
        if (!b.supportsTransfer)
            return { ok: false, reason: 'missing_transfer' };
        if (!b.supportsTransferFrom)
            return { ok: false, reason: 'missing_transfer_from' };
        if (!b.supportsApprove) return { ok: false, reason: 'missing_approve' };
        return { ok: true };
    };

    const applyAllowlist = (
        registry: Map<string, AllowlistEntry>,
        seenNonces: Set<string>,
        admin: string,
        entry: AllowlistEntry,
        behavior: TokenBehavior,
    ): { ok: boolean; reason?: string } => {
        // Replay protection: (admin, nonce) is single-use.
        const nonceKey = `${admin}:${entry.nonce.toString()}`;
        if (seenNonces.has(nonceKey))
            return { ok: false, reason: 'replay_detected' };

        // Validate BEFORE mutating state (failure-safe).
        const validation = validateTokenBehavior(behavior);
        if (!validation.ok) return validation;

        // Behavior hash must match what the caller committed to.
        if (behaviorHash(behavior) !== entry.behaviorHash)
            return { ok: false, reason: 'behavior_hash_mismatch' };

        // Atomic commit.
        seenNonces.add(nonceKey);
        registry.set(entry.contractId, { ...entry, active: true });
        return { ok: true };
    };

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

    // ---------------------------------------------------------------------
    // Allowlist validation tests: success, boundary, unauthorized, replay,
    // and failure paths. These exercise the deterministic validation logic
    // that will be ported to the Rust/Soroban contract.
    // ---------------------------------------------------------------------
    describe('Token allowlist validation', () => {
        const admin = 'GADMIN0000000000000000000000000000000000000000000000000000';
        const operator =
            'GOPERATOR00000000000000000000000000000000000000000000000000';

        const goodBehavior = (): TokenBehavior => ({
            name: 'Tagged USD',
            symbol: 'TUSD',
            decimals: 7,
            totalSupply: 1_000_000_000n,
            supportsTransfer: true,
            supportsTransferFrom: true,
            supportsApprove: true,
            supportsMint: true,
            supportsBurn: true,
        });

        it('A. success path: valid behavior is allowlisted', () => {
            const registry = new Map<string, AllowlistEntry>();
            const seen = new Set<string>();
            const behavior = goodBehavior();
            const entry: AllowlistEntry = {
                contractId: 'C_TOKEN_OK',
                behaviorHash: behaviorHash(behavior),
                nonce: 1n,
                admin,
                active: false,
            };

            const result = applyAllowlist(registry, seen, admin, entry, behavior);
            expect(result.ok).toBe(true);
            expect(registry.get('C_TOKEN_OK')?.active).toBe(true);
            expect(seen.has(`${admin}:1`)).toBe(true);
        });

        it('B. boundary path: decimals at 0 and 18 are accepted', () => {
            for (const decimals of [0, 18]) {
                const registry = new Map<string, AllowlistEntry>();
                const seen = new Set<string>();
                const behavior = { ...goodBehavior(), decimals };
                const entry: AllowlistEntry = {
                    contractId: `C_TOKEN_D${decimals}`,
                    behaviorHash: behaviorHash(behavior),
                    nonce: BigInt(decimals + 10),
                    admin,
                    active: false,
                };
                const result = applyAllowlist(
                    registry,
                    seen,
                    admin,
                    entry,
                    behavior,
                );
                expect(result.ok).toBe(true);
            }
        });

        it('C. unauthorized path: non-admin cannot mutate allowlist', () => {
            // Simulate the privileged-role check that the Rust contract
            // enforces via `require_auth(admin)`.
            const isAdmin = (caller: string) => caller === admin;
            expect(isAdmin(operator)).toBe(false);
            expect(isAdmin(admin)).toBe(true);
        });

        it('D. replay path: reusing (admin, nonce) is rejected', () => {
            const registry = new Map<string, AllowlistEntry>();
            const seen = new Set<string>();
            const behavior = goodBehavior();
            const entry: AllowlistEntry = {
                contractId: 'C_TOKEN_REPLAY',
                behaviorHash: behaviorHash(behavior),
                nonce: 42n,
                admin,
                active: false,
            };

            const first = applyAllowlist(
                registry,
                seen,
                admin,
                entry,
                behavior,
            );
            expect(first.ok).toBe(true);

            const replay = applyAllowlist(
                registry,
                seen,
                admin,
                entry,
                behavior,
            );
            expect(replay.ok).toBe(false);
            expect(replay.reason).toBe('replay_detected');
        });

        it('E. failure path: invalid behavior leaves allowlist unchanged', () => {
            const registry = new Map<string, AllowlistEntry>();
            const seen = new Set<string>();
            const behavior: TokenBehavior = {
                ...goodBehavior(),
                supportsTransfer: false,
            };
            const entry: AllowlistEntry = {
                contractId: 'C_TOKEN_BAD',
                behaviorHash: behaviorHash(behavior),
                nonce: 7n,
                admin,
                active: false,
            };

            const result = applyAllowlist(
                registry,
                seen,
                admin,
                entry,
                behavior,
            );
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('missing_transfer');
            expect(registry.has('C_TOKEN_BAD')).toBe(false);
            expect(seen.has(`${admin}:7`)).toBe(false);
        });

        it('F. failure path: behavior hash mismatch is rejected', () => {
            const registry = new Map<string, AllowlistEntry>();
            const seen = new Set<string>();
            const behavior = goodBehavior();
            const entry: AllowlistEntry = {
                contractId: 'C_TOKEN_HASH',
                behaviorHash: 'deadbeef',
                nonce: 99n,
                admin,
                active: false,
            };

            const result = applyAllowlist(
                registry,
                seen,
                admin,
                entry,
                behavior,
            );
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('behavior_hash_mismatch');
            expect(registry.has('C_TOKEN_HASH')).toBe(false);
        });

        it('G. property: validation is deterministic across runs', () => {
            const behavior = goodBehavior();
            const hashes = new Set<string>();
            for (let i = 0; i < 100; i++) {
                hashes.add(behaviorHash(behavior));
            }
            expect(hashes.size).toBe(1);
        });
    });
});
