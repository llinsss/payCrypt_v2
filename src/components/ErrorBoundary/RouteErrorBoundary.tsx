/**
 * src/components/ErrorBoundary/RouteErrorBoundary.tsx
 *
 * Thin wrapper around ErrorBoundary for route-level use.
 * Accepts an optional `name` prop to label the boundary in error reports.
 *
 * Usage:
 *   <RouteErrorBoundary name="payments">
 *     <SwapView />
 *   </RouteErrorBoundary>
 */

import React, { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  name?: string;
}

export function RouteErrorBoundary({
  children,
  name = "route",
}: RouteErrorBoundaryProps) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export default RouteErrorBoundary;
