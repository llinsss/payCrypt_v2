// #620: bundled with esbuild --platform=browser as a CI gate to catch
// accidental Node-only dependencies (fs, http, Buffer, process, ...) before
// publish. Bundling failure means the package is not safe to use in a
// browser runtime.
import { TaggedSDK, ApiError } from '@tagged/sdk';

if (typeof TaggedSDK !== 'function') {
  throw new Error('TaggedSDK export missing in browser bundle');
}
if (typeof ApiError !== 'function') {
  throw new Error('ApiError export missing in browser bundle');
}
