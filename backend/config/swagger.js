import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TaggedPay API",
      version: "1.0.0",
      description:
        "TaggedPay is a tag-based cryptocurrency payment platform. Send and receive crypto using human-readable @tags instead of complex wallet addresses. Supports multi-chain operations, bill payments, and fiat conversion.",
      contact: {
        name: "TaggedPay Support",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
      {
        url: "https://api.taggedpay.com",
        description: "Production server",
      },
    ],
    tags: [
      { name: "Authentication", description: "User registration and login" },
      { name: "Users", description: "User profile and dashboard" },
      { name: "Transactions", description: "Transaction records and payment processing" },
      { name: "Balances", description: "Token balance management and sync" },
      { name: "Wallets", description: "Wallet management and transfers" },
      { name: "KYC", description: "Know Your Customer verification" },
      { name: "Tokens", description: "Supported token configuration" },
      { name: "Chains", description: "Blockchain network configuration" },
      { name: "Bank Accounts", description: "Bank account management" },
      { name: "Notifications", description: "User notification management" },
      { name: "API Keys", description: "API key management and rotation" },
      { name: "Tags", description: "Tag registration and resolution" },
      { name: "General", description: "On-chain operations and file uploads" },
      { name: "Bills & VTU", description: "Bill payments, airtime, data, and TV subscriptions" },
      { name: "Rates", description: "Cryptocurrency and fiat exchange rates" },
      { name: "Health", description: "System health checks" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token obtained from /api/auth/login",
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "API key for programmatic access",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            tag: { type: "string", example: "johndoe" },
            email: { type: "string", example: "john@example.com" },
            address: { type: "string", example: "0x1234..." },
            role: { type: "string", example: "user" },
            is_verified: { type: "boolean", example: false },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            reference: { type: "string", example: "TXN_abc123xyz789" },
            type: { type: "string", enum: ["credit", "debit"], example: "credit" },
            status: { type: "string", enum: ["pending", "completed", "failed"], example: "completed" },
            amount: { type: "string", example: "100.00" },
            usd_value: { type: "string", example: "100.00" },
            tx_hash: { type: "string", example: "0xabc123..." },
            from_address: { type: "string", example: "johndoe" },
            to_address: { type: "string", example: "janedoe" },
            description: { type: "string", example: "Fund transfer" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        TransactionRequest: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["credit", "debit"] },
            amount: { type: "string" },
            status: { type: "string", enum: ["pending", "completed", "failed"] },
            token: { type: "string" },
            description: { type: "string" },
          },
        },
        Balance: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            token_id: { type: "integer", example: 1 },
            amount: { type: "string", example: "100.50" },
            usd_value: { type: "string", example: "100.50" },
            ngn_value: { type: "number", example: 160800 },
            address: { type: "string", example: "0x1234..." },
            token_symbol: { type: "string", example: "USDT" },
            token_name: { type: "string", example: "Tether USD" },
          },
        },
        Wallet: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            address: { type: "string", example: "0x1234..." },
            chain_id: { type: "integer", example: 1 },
            is_default: { type: "boolean", example: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Token: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Tether USD" },
            symbol: { type: "string", example: "USDT" },
            contract_address: { type: "string" },
            chain_id: { type: "integer" },
            decimals: { type: "integer", example: 6 },
            is_active: { type: "boolean", example: true },
          },
        },
        Chain: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Ethereum" },
            chain_id: { type: "integer", example: 1 },
            rpc_url: { type: "string" },
            explorer_url: { type: "string" },
            is_active: { type: "boolean", example: true },
          },
        },
        BankAccount: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            bank_name: { type: "string", example: "GTBank" },
            account_number: { type: "string", example: "0123456789" },
            account_name: { type: "string", example: "John Doe" },
            is_default: { type: "boolean", example: true },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            title: { type: "string", example: "Payment Received" },
            message: { type: "string", example: "You received 100 USDT from @janedoe" },
            is_read: { type: "boolean", example: false },
            created_at: { type: "string", format: "date-time" },
          },
        },
        KYC: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            document_type: { type: "string", example: "passport" },
            document_url: { type: "string" },
            status: { type: "string", enum: ["pending", "approved", "rejected"], example: "pending" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        ApiKey: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            user_id: { type: "integer", example: 1 },
            name: { type: "string", example: "My API Key" },
            key_prefix: { type: "string", example: "tp_live_abc" },
            scopes: { type: "string", example: "read,write" },
            ip_whitelist: { type: "string", example: "192.168.1.1" },
            last_used_at: { type: "string", format: "date-time" },
            expires_at: { type: "string", format: "date-time" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Tag: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            tag: { type: "string", example: "johndoe" },
            stellar_address: { type: "string", example: "GABCDEF..." },
            created_at: { type: "string", format: "date-time" },
          },
        },
        PaymentProcess: {
          type: "object",
          required: ["senderTag", "recipientTag", "amount"],
          properties: {
            senderTag: { type: "string", example: "johndoe", description: "Sender's @tag (3-20 alphanumeric chars)" },
            recipientTag: { type: "string", example: "janedoe", description: "Recipient's @tag" },
            amount: { type: "number", example: 50.0, description: "Amount to send" },
            asset: { type: "string", example: "XLM", default: "XLM" },
            assetIssuer: { type: "string", description: "Asset issuer for non-native assets" },
            memo: { type: "string", example: "Lunch payment", description: "Optional memo (max 28 chars)" },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: "Authentication required",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Unauthorized - Invalid or expired token" },
            },
          },
        },
        ValidationError: {
          description: "Validation failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ValidationError" },
              example: { error: "Validation failed", details: ["\"email\" is required"] },
            },
          },
        },
        NotFoundError: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Resource not found" },
            },
          },
        },
        InternalServerError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Internal server error" },
            },
          },
        },
        RateLimitError: {
          description: "Too many requests",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string" },
                  retryAfter: { type: "integer" },
                },
              },
              example: { error: "Too many requests, please try again later", retryAfter: 60 },
            },
          },
        },
      },
    },
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
