// #620: smoke test run against the package as installed from the packed
// tarball, verifying the ESM entry point resolves and the primary exports
// are the expected shape.
import assert from 'node:assert/strict';
import * as pkg from '@tagged/sdk';

assert.equal(typeof pkg.TaggedSDK, 'function', 'TaggedSDK should be exported as a class');
assert.equal(typeof pkg.ApiError, 'function', 'ApiError should be exported as a class');
assert.equal(typeof pkg.AuthResource, 'function', 'AuthResource should be exported as a class');

console.log(`[smoke:esm] @tagged/sdk import OK — ${Object.keys(pkg).length} exports`);
