// #620: smoke test run against the package as installed from the packed
// tarball, verifying the ESM entry point resolves and the primary exports
// are the expected shape.
import assert from 'node:assert/strict';
import * as pkg from '@tagged/stellar-sdk';

assert.equal(typeof pkg.TaggedStellar, 'function', 'TaggedStellar should be exported as a class');
assert.equal(typeof pkg.ApiError, 'function', 'ApiError should be exported as a class');
assert.equal(typeof pkg.AccountsResource, 'function', 'AccountsResource should be exported as a class');

console.log(`[smoke:esm] @tagged/stellar-sdk import OK — ${Object.keys(pkg).length} exports`);
