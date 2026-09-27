// #620: bundled with esbuild --platform=browser as a CI gate to catch
// accidental Node-only dependencies (fs, http, Buffer, process, ...) before
// publish. Bundling failure means the package is not safe to use in a
// browser runtime.
import { TaggedStellar, ApiError } from '@tagged/stellar-sdk';

if (typeof TaggedStellar !== 'function') {
  throw new Error('TaggedStellar export missing in browser bundle');
}
if (typeof ApiError !== 'function') {
  throw new Error('ApiError export missing in browser bundle');
}
