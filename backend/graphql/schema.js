export const typeDefs = `#graphql
  type User {
    id: ID!
    email: String!
    tag: String
    address: String
    kyc_status: String
    role: String
    photo: String
    is_verified: Boolean
    last_login: String
    created_at: String
    updated_at: String
    two_factor_enabled: Boolean
    currency_preference: String
  }

  type Transaction {
    id: ID!
    user_id: ID!
    token_id: ID
    chain_id: ID
    reference: String
    type: String!
    status: String!
    tx_hash: String
    usd_value: String
    amount: String!
    from_address: String
    to_address: String
    description: String
    extra: String
    created_at: String
    updated_at: String
    notes: String
    user_email: String
    user_tag: String
    explorer_link: String
  }

  type Query {
    me: User
    myTransactions(limit: Int, offset: Int): [Transaction]
    transaction(id: ID!): Transaction
  }
`;
