/**
 * src/components/ErrorBoundary/ErrorBoundary.tsx
 *
 * Generic React class-based error boundary (issue #524).
 *
 * Features:
 *  - Catches render / lazy-load errors and displays a safe fallback UI
 *  - Exposes retry (remount), safe navigation to dashboard, and error details
 *  - Reports sanitised exceptions to the configured observability backend
 *    (window.__reportError if present, e.g. Sentry/OpenTelemetry)
 *  - Generates a unique correlation ID for each caught error so support can
 *    cross-reference logs
 *  - Strips tokens, wallet keys, seeds, and common PII patterns before
 *    reporting so sensitive values never leave the browser
 */

import React, { Component, ErrorInfo, ReactNode } from "react";

// ── Sanitisation helpers ─────────────────────────────────────────────────────

const SENSITIVE_PATTERNS: RegExp[] = [
  // JWT
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  // Hex private keys / seeds (32-64 bytes)
  /\b[0-9a-fA-F]{64}\b/g,
  // Stellar secret keys (S...)
  /\bS[A-Z2-7]{55}\b/g,
  // Stellar public keys (G...)
  /\bG[A-Z2-7]{55}\b/g,
  // Ethereum-style addresses
  /\b0x[0-9a-fA-F]{40}\b/g,
  // Common env-style tokens
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  // 12/24-word mnemonic fragment heuristic
  /\b\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+\b/g,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Nigerian / international phone numbers
  /\+?[0-9]{7,15}/g,
];

/** Return the input string with sensitive patterns replaced by [REDACTED]. */
function sanitise(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ── Correlation ID ───────────────────────────────────────────────────────────

function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `err-${ts}-${rand}`.toUpperCase();
}

// ── Observability reporting ──────────────────────────────────────────────────

type ReportFn = (event: {
  message: string;
  stack?: string;
  componentStack?: string;
  correlationId: string;
  boundary: string;
}) => void;

declare global {
  interface Window {
    /** Attach Sentry.captureException or a custom reporter here. */
    __reportError?: ReportFn;
  }
}

function reportError(
  error: Error,
  errorInfo: ErrorInfo,
  correlationId: string,
  boundary: string
) {
  if (typeof window === "undefined") return;
  const reporter = window.__reportError;
  if (typeof reporter !== "function") return;

  try {
    reporter({
      message: sanitise(error.message),
      stack: error.stack ? sanitise(error.stack) : undefined,
      componentStack: errorInfo.componentStack
        ? sanitise(errorInfo.componentStack)
        : undefined,
      correlationId,
      boundary,
    });
  } catch {
    // Never let the reporter itself break anything.
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ErrorBoundaryProps {
  /** Rendered when no error has been caught. */
  children: ReactNode;
  /**
   * Custom fallback UI factory.
   * Receives retry, goHome callbacks and the correlationId.
   */
  fallback?: (opts: {
    error: Error;
    correlationId: string;
    retry: () => void;
    goHome: () => void;
  }) => ReactNode;
  /** Label shown in error reports to identify which boundary fired. */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  correlationId: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, correlationId: "" };
    this.retry = this.retry.bind(this);
    this.goHome = this.goHome.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      correlationId: generateCorrelationId(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { name = "ErrorBoundary" } = this.props;
    const { correlationId } = this.state;
    console.error(
      `[${name}] Caught error (${correlationId}):`,
      sanitise(error.message)
    );
    reportError(error, errorInfo, correlationId, name);
  }

  retry() {
    this.setState({ hasError: false, error: null, correlationId: "" });
  }

  goHome() {
    this.retry();
    // Use location.replace so the stack is cleared and React remounts cleanly.
    window.location.replace("/");
  }

  render() {
    const { hasError, error, correlationId } = this.state;
    const { children, fallback } = this.props;

    if (!hasError || !error) return children;

    if (typeof fallback === "function") {
      return fallback({
        error,
        correlationId,
        retry: this.retry,
        goHome: this.goHome,
      });
    }

    return (
      <DefaultErrorFallback
        error={error}
        correlationId={correlationId}
        retry={this.retry}
        goHome={this.goHome}
      />
    );
  }
}

// ── Default fallback UI ──────────────────────────────────────────────────────

interface FallbackProps {
  error: Error;
  correlationId: string;
  retry: () => void;
  goHome: () => void;
}

function DefaultErrorFallback({
  error,
  correlationId,
  retry,
  goHome,
}: FallbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="min-h-[50vh] flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl shadow-lg p-8 text-center">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <svg
            aria-hidden="true"
            className="h-7 w-7 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Something went wrong
        </h2>

        <p className="mb-6 text-sm text-gray-500">
          An unexpected error occurred on this page. Your funds and account are
          safe. You can try again or return to the dashboard.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Try again
          </button>

          <button
            type="button"
            onClick={goHome}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            Go to dashboard
          </button>
        </div>

        {/* Correlation ID — useful for support without revealing secrets */}
        <p className="mt-6 text-xs text-gray-400">
          Error reference:{" "}
          <code className="font-mono text-gray-500">{correlationId}</code>
        </p>
      </div>
    </div>
  );
}

export default ErrorBoundary;
