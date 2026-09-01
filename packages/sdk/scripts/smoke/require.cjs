'use strict';
// #620: smoke test run against the package as installed from the packed
// tarball (not the monorepo source), verifying the CJS entry point resolves
// and the primary exports are the expected shape.
const assert = require('node:assert/strict');
const pkg = require('@tagged/sdk');

assert.equal(typeof pkg.TaggedSDK, 'function', 'TaggedSDK should be exported as a class');
assert.equal(typeof pkg.ApiError, 'function', 'ApiError should be exported as a class');
assert.equal(typeof pkg.AuthResource, 'function', 'AuthResource should be exported as a class');

console.log(`[smoke:cjs] @tagged/sdk require() OK — ${Object.keys(pkg).length} exports`);
