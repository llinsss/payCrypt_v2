export const user = {
  id: "user-1",
  email: "ada@example.com",
  tag: "ada",
  address: "GABC123",
  photo: "https://example.com/ada.png",
  is_verified: true,
  kyc_status: "verified",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  role: "user",
};

export const authSuccess = {
  message: "Login successful",
  token: "jwt-token",
  user,
};

export const profileSuccess = {
  message: "Profile fetched",
  user,
};

export const transaction = {
  id: "tx-1",
  userId: "user-1",
  type: "transfer",
  token: "USDC",
  amount: 25,
  usd_value: 25,
  status: "completed",
  tx_hash: "hash-1",
  chain: "stellar",
  created_at: "2026-01-03T00:00:00.000Z",
};

export const transactionList = [transaction];

export const errorEnvelopes = {
  unauthorized: { error: "Invalid credentials" },
  server: { error: "Service unavailable" },
};

export const amountSuccess = { amount: "25.00" };