/**
 * Creates a logger that is a no-op unless explicitly enabled. Takes the
 * enabled flag as a parameter (rather than reading import.meta.env directly)
 * so it stays plain-testable and callers control exactly what "enabled" means.
 */
export function createDebugLogger(enabled: boolean) {
  return (...args: unknown[]): void => {
    if (!enabled) return;
    // eslint-disable-next-line no-console
    console.log(...args);
  };
}
