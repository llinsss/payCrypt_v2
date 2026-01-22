import TagService from './services/TagService.js';

// Mock DB for demonstration if running without DB connection would fail
// But TagService imports global `db` instance which tries to connect.
// Ensuring this script doesn't crash requires a running DB.

async function verifyTags() {
    console.log('--- Verifying Tag Service Logic ---');

    const testTag = 'john_doe';
    const testAddress = 'G-TEST-ADDRESS-1234567890123456789012345678901234567890123456';

    try {
        console.log(`1. Creating tag: @${testTag}`);
        // This will fail if DB is not connected/migrated
        const created = await TagService.createTag(testTag, testAddress);
        console.log('   Success:', created);

        console.log(`2. Resolving tag: @${testTag.toUpperCase()} (case-insensitive check)`);
        const resolved = await TagService.resolveTag(testTag.toUpperCase());
        console.log('   Resolved:', resolved);

        if (resolved.stellar_address === testAddress) {
            console.log('   ✅ Address matches');
        } else {
            console.error('   ❌ Address mismatch');
        }

    } catch (error) {
        console.error('   ⚠️ Error during verification (expected if DB is not running):', error.message);
    }
}

// verifyTags(); 
// Not automatically running to avoid cluttering console or crashing process if no DB.
