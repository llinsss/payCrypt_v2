/**
 * Canonical payment QR URI grammar shared by all QR producers/consumers in
 * the app, so every client encodes/decodes the same scheme instead of each
 * screen inventing its own ad-hoc payload (e.g. raw JSON.stringify).
 *
 * Grammar: paycrypt:<tag>?address=<addr>&token=<symbol>&amount=<decimal>&memo=<text>&network=<net>&v=<version>
 * - tag, address, token, network, v are required.
 * - amount and memo are optional.
 * - All field values are percent-encoded via the URL API (URLSearchParams).
 */

export const PAYMENT_URI_SCHEME = "paycrypt";
export const PAYMENT_URI_VERSION = "1.0";
export const DEFAULT_PAYMENT_NETWORK = "default";

export interface PaymentUriParams {
  tag: string;
  address: string;
  token: string;
  amount?: string;
  memo?: string;
  network: string;
  version: string;
}

export class InvalidPaymentUriError extends Error {}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeAmount = (amount: unknown): string | undefined => {
  if (amount === undefined || amount === null || amount === "") {
    return undefined;
  }
  const numericAmount = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new InvalidPaymentUriError(
      "amount must be a finite, non-negative number"
    );
  }
  return String(numericAmount);
};

export interface BuildPaymentUriInput {
  tag: string;
  address: string;
  token: string;
  amount?: number | string;
  memo?: string;
  network?: string;
}

/** Builds a canonical, percent-encoded payment URI. Throws InvalidPaymentUriError on bad input. */
export const buildPaymentUri = ({
  tag,
  address,
  token,
  amount,
  memo,
  network = DEFAULT_PAYMENT_NETWORK,
}: BuildPaymentUriInput): string => {
  if (!isNonEmptyString(tag)) {
    throw new InvalidPaymentUriError("tag is required");
  }
  if (!isNonEmptyString(address)) {
    throw new InvalidPaymentUriError("address is required");
  }
  if (!isNonEmptyString(token)) {
    throw new InvalidPaymentUriError("token is required");
  }
  if (!isNonEmptyString(network)) {
    throw new InvalidPaymentUriError("network is required");
  }

  const normalizedAmount = normalizeAmount(amount);

  const query = new URLSearchParams();
  query.set("address", address);
  query.set("token", token);
  if (normalizedAmount !== undefined) {
    query.set("amount", normalizedAmount);
  }
  if (isNonEmptyString(memo)) {
    query.set("memo", memo);
  }
  query.set("network", network);
  query.set("v", PAYMENT_URI_VERSION);

  return `${PAYMENT_URI_SCHEME}:${encodeURIComponent(tag)}?${query.toString()}`;
};

/** Parses and validates a canonical payment URI. Throws InvalidPaymentUriError on malformed/unsupported input. */
export const parsePaymentUri = (uri: string): PaymentUriParams => {
  const prefix = `${PAYMENT_URI_SCHEME}:`;
  if (!isNonEmptyString(uri) || !uri.startsWith(prefix)) {
    throw new InvalidPaymentUriError(`URI must start with "${prefix}"`);
  }

  const rest = uri.slice(prefix.length);
  const separatorIndex = rest.indexOf("?");
  const encodedTag =
    separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
  const queryString = separatorIndex === -1 ? "" : rest.slice(separatorIndex + 1);

  let tag: string;
  try {
    tag = decodeURIComponent(encodedTag);
  } catch {
    throw new InvalidPaymentUriError("tag is not validly percent-encoded");
  }
  if (!isNonEmptyString(tag)) {
    throw new InvalidPaymentUriError("tag is required");
  }

  const query = new URLSearchParams(queryString);
  const address = query.get("address");
  const token = query.get("token");
  const network = query.get("network");
  const version = query.get("v");
  const amountRaw = query.get("amount");
  const memo = query.get("memo") ?? undefined;

  if (!isNonEmptyString(address)) {
    throw new InvalidPaymentUriError("address is required");
  }
  if (!isNonEmptyString(token)) {
    throw new InvalidPaymentUriError("token is required");
  }
  if (!isNonEmptyString(network)) {
    throw new InvalidPaymentUriError("network is required");
  }
  if (version !== PAYMENT_URI_VERSION) {
    throw new InvalidPaymentUriError(`unsupported version: ${version}`);
  }

  const amount = amountRaw === null ? undefined : normalizeAmount(amountRaw);

  return { tag, address, token, amount, memo, network, version };
};
