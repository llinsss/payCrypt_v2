export class ApiContractError extends Error {
  constructor(
    public readonly contract: string,
    public readonly path: string,
    public readonly received: unknown
  ) {
    super(`Invalid ${contract} response at ${path}`);
    this.name = "ApiContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, contract: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new ApiContractError(contract, "$", value);
  return value;
};

const requireString = (value: unknown, contract: string, path: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiContractError(contract, path, value);
  }
  return value;
};

const requireNumber = (value: unknown, contract: string, path: string): number => {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ApiContractError(contract, path, value);
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) throw new ApiContractError(contract, path, value);
  return numberValue;
};

export const parseAuthResponse = (value: unknown) => {
  const contract = "auth response";
  const response = requireRecord(value, contract);
  requireString(response.message, contract, "$.message");
  parseUser(response.user, contract, "$.user");
  return value as {
    message: string;
    user: Record<string, unknown>;
  };
};

export const parseUser = (value: unknown, contract = "user response", path = "$") => {
  const user = requireRecord(value, contract);
  for (const field of ["id", "email", "tag", "address", "created_at"]) {
    requireString(user[field], contract, `${path}.${field}`);
  }
  if (typeof user.is_verified !== "boolean") {
    throw new ApiContractError(contract, `${path}.is_verified`, user.is_verified);
  }
  requireString(user.kyc_status, contract, `${path}.kyc_status`);
  return value;
};

export const parseProfileResponse = (value: unknown) => {
  const response = requireRecord(value, "profile response");
  parseUser(response.user, "profile response", "$.user");
  return response.user;
};

export const parseTransaction = (value: unknown, path = "$") => {
  const contract = "transaction response";
  const transaction = requireRecord(value, contract);
  for (const field of ["id", "type", "token", "status", "chain", "created_at"]) {
    requireString(transaction[field], contract, `${path}.${field}`);
  }
  requireNumber(transaction.amount, contract, `${path}.amount`);
  requireNumber(transaction.usd_value, contract, `${path}.usd_value`);
  return value;
};

export const parseTransactionList = (value: unknown) => {
  if (!Array.isArray(value)) throw new ApiContractError("transaction list response", "$", value);
  value.forEach((transaction, index) => parseTransaction(transaction, `$[${index}]`));
  return value;
};

export const parseAmountResponse = (value: unknown): string => {
  const contract = "amount response";
  const response = requireRecord(value, contract);
  const amount = response.amount ?? response.usd_value ?? response.value;
  if (typeof amount !== "number" && typeof amount !== "string") {
    throw new ApiContractError(contract, "$.amount", amount);
  }
  if (!Number.isFinite(Number(amount))) throw new ApiContractError(contract, "$.amount", amount);
  return String(amount);
};