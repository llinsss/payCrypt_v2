import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TaggedPay API Documentation",
      version: "1.0.0",
      description: `
## Overview
TaggedPay is a comprehensive crypto payment platform that enables users to send and receive cryptocurrency using human-readable tags instead of complex wallet addresses.

## Key Features
- **Tag-based Transfers**: Send crypto using simple tags like @username
- **Multi-chain Support**: Support for EVM chains and Starknet
- **Balance Management**: Real-time balance tracking across multiple tokens
- **Transaction History**: Complete transaction records with status tracking
- **KYC Integration**: Know Your Customer verification system
- **Bill Payments**: Airtime, data, TV subscriptions, and utility payments

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

Tokens are obtained through the login endpoint and expire after 24 hours.
      `,
      contact: {
        name: "TaggedPay Support",
        email: "support@taggedpay.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
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
      {
        name: "Authentication",
        description: "User registration and login endpoints",
      },
      {
        name: "Users",
        description: "User profile and account management",
      },
      {
        name: "Wallets",
        description: "Wallet management and fund transfers",
      },
      {
        name: "Balances",
        description: "Token balance queries and management",
      },
      {
        name: "Transactions",
        description: "Transaction history and management",
      },
      {
        name: "Bank Accounts",
        description: "Bank account management for fiat operations",
      },
      {
        name: "KYC",
        description: "Know Your Customer verification",
      },
      {
        name: "Tokens",
        description: "Supported cryptocurrency tokens",
      },
      {
        name: "Chains",
        description: "Supported blockchain networks",
      },
      {
        name: "Notifications",
        description: "User notifications management",
      },
      {
        name: "General",
        description: "General utilities, rates, and bill payments",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token obtained from the login endpoint",
        },
      },
      schemas: {
        // Error Responses
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
            },
          },
          example: {
            error: "Invalid credentials",
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Validation error message",
            },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },

        // Authentication Schemas
        RegisterRequest: {
          type: "object",
          required: ["tag", "email", "password"],
          properties: {
            tag: {
              type: "string",
              minLength: 3,
              maxLength: 50,
              description: "Unique user tag for receiving payments",
              example: "johndoe",
            },
            email: {
              type: "string",
              format: "email",
              description: "User email address",
              example: "john@example.com",
            },
            password: {
              type: "string",
              minLength: 6,
              description: "User password (min 6 characters)",
              example: "securePassword123",
            },
            address: {
              type: "string",
              nullable: true,
              description: "Optional wallet address",
              example: "0x1234567890abcdef...",
            },
            role: {
              type: "string",
              nullable: true,
              description: "User role",
              example: "user",
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              description: "User email address",
              example: "john@example.com",
            },
            password: {
              type: "string",
              description: "User password",
              example: "securePassword123",
            },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "User registered successfully",
            },
            token: {
              type: "string",
              description: "JWT authentication token",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            user: {
              $ref: "#/components/schemas/User",
            },
          },
        },

        // User Schema
        User: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "User ID",
              example: 1,
            },
            tag: {
              type: "string",
              description: "Unique user tag",
              example: "johndoe",
            },
            email: {
              type: "string",
              format: "email",
              example: "john@example.com",
            },
            address: {
              type: "string",
              nullable: true,
              description: "Wallet address",
            },
            photo: {
              type: "string",
              description: "Profile photo URL",
              example: "https://api.dicebear.com/9.x/initials/svg?seed=johndoe",
            },
            kyc_status: {
              type: "string",
              enum: ["pending", "approved", "rejected"],
              description: "KYC verification status",
              example: "pending",
            },
            role: {
              type: "string",
              example: "user",
            },
            last_login: {
              type: "string",
              format: "date-time",
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // Dashboard Summary
        DashboardSummary: {
          type: "object",
          properties: {
            total_balance: {
              type: "number",
              description: "Total balance in USD",
              example: 1250.5,
            },
            total_deposit: {
              type: "number",
              description: "Total deposits in USD",
              example: 5000.0,
            },
            total_withdrawal: {
              type: "number",
              description: "Total withdrawals in USD",
              example: 3749.5,
            },
            portfolio_growth: {
              type: "number",
              description: "Portfolio growth percentage",
              example: 0,
            },
          },
        },

        // Balance Schema
        Balance: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            user_id: {
              type: "integer",
              example: 1,
            },
            token_id: {
              type: "integer",
              example: 1,
            },
            amount: {
              type: "string",
              description: "Token amount",
              example: "100.5",
            },
            usd_value: {
              type: "string",
              description: "USD equivalent value",
              example: "100.5",
            },
            ngn_value: {
              type: "number",
              description: "NGN equivalent value",
              example: 160800,
            },
            address: {
              type: "string",
              description: "Deposit address for this token",
              example: "0x1234567890abcdef...",
            },
            token_symbol: {
              type: "string",
              example: "USDT",
            },
            token_name: {
              type: "string",
              example: "Tether USD",
            },
            token_price: {
              type: "number",
              example: 1.0,
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // Transaction Schema
        Transaction: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            user_id: {
              type: "integer",
              example: 1,
            },
            reference: {
              type: "string",
              description: "Unique transaction reference",
              example: "TXN_abc123xyz789",
            },
            type: {
              type: "string",
              enum: ["credit", "debit"],
              description: "Transaction type",
              example: "credit",
            },
            status: {
              type: "string",
              enum: ["pending", "completed", "failed"],
              example: "completed",
            },
            amount: {
              type: "string",
              example: "100.00",
            },
            usd_value: {
              type: "string",
              example: "100.00",
            },
            tx_hash: {
              type: "string",
              description: "Blockchain transaction hash",
              example: "0xabc123...",
            },
            from_address: {
              type: "string",
              example: "johndoe",
            },
            to_address: {
              type: "string",
              example: "janedoe",
            },
            description: {
              type: "string",
              example: "Fund transfer",
            },
            token_id: {
              type: "integer",
              example: 1,
            },
            chain_id: {
              type: "integer",
              example: 1,
            },
            timestamp: {
              type: "string",
              format: "date-time",
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
          },
        },
        TransactionRequest: {
          type: "object",
          properties: {
            wallet_id: {
              type: "integer",
              nullable: true,
            },
            reference: {
              type: "string",
              nullable: true,
            },
            type: {
              type: "string",
              enum: ["credit", "debit"],
            },
            action: {
              type: "string",
              nullable: true,
            },
            amount: {
              type: "string",
            },
            status: {
              type: "string",
              enum: ["pending", "completed", "failed"],
            },
            hash: {
              type: "string",
              nullable: true,
            },
            token: {
              type: "string",
              nullable: true,
            },
            rate: {
              type: "string",
              nullable: true,
            },
            description: {
              type: "string",
              nullable: true,
            },
            extra: {
              type: "object",
              nullable: true,
            },
          },
        },

        // Wallet Schema
        Wallet: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            user_id: {
              type: "integer",
              example: 1,
            },
            auto_convert_threshold: {
              type: "string",
              nullable: true,
              description: "Auto-convert threshold amount",
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // Transfer Requests
        SendToTagRequest: {
          type: "object",
          required: ["receiver_tag", "amount", "balance_id"],
          properties: {
            receiver_tag: {
              type: "string",
              description: "Recipient's tag",
              example: "janedoe",
            },
            amount: {
              type: "number",
              description: "Amount to send",
              example: 50.0,
            },
            balance_id: {
              type: "integer",
              description: "Source balance ID",
              example: 1,
            },
          },
        },
        SendToWalletRequest: {
          type: "object",
          required: ["receiver_address", "amount", "balance_id"],
          properties: {
            receiver_address: {
              type: "string",
              description: "Recipient's wallet address",
              example: "0x1234567890abcdef...",
            },
            amount: {
              type: "number",
              description: "Amount to send",
              example: 50.0,
            },
            balance_id: {
              type: "integer",
              description: "Source balance ID",
              example: 1,
            },
          },
        },
        TransferResponse: {
          type: "object",
          properties: {
            data: {
              type: "string",
              example: "success",
            },
            txHash: {
              type: "string",
              description: "Blockchain transaction hash",
              example: "0xabc123def456...",
            },
          },
        },

        // Bank Account Schema
        BankAccount: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            user_id: {
              type: "integer",
              example: 1,
            },
            bank_name: {
              type: "string",
              example: "First Bank",
            },
            account_number: {
              type: "string",
              example: "1234567890",
            },
            account_name: {
              type: "string",
              example: "John Doe",
            },
            bank_code: {
              type: "string",
              example: "011",
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // KYC Schema
        KYC: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            user_id: {
              type: "integer",
              example: 1,
            },
            document_type: {
              type: "string",
              enum: [
                "passport",
                "national_id",
                "drivers_license",
                "voters_card",
              ],
              example: "national_id",
            },
            document_number: {
              type: "string",
              example: "A12345678",
            },
            document_front: {
              type: "string",
              description: "URL to front image of document",
            },
            document_back: {
              type: "string",
              description: "URL to back image of document",
            },
            selfie: {
              type: "string",
              description: "URL to selfie image",
            },
            status: {
              type: "string",
              enum: ["pending", "approved", "rejected"],
              example: "pending",
            },
            rejection_reason: {
              type: "string",
              nullable: true,
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },
        KYCRequest: {
          type: "object",
          required: ["document_type", "document_number"],
          properties: {
            document_type: {
              type: "string",
              enum: [
                "passport",
                "national_id",
                "drivers_license",
                "voters_card",
              ],
              example: "national_id",
            },
            document_number: {
              type: "string",
              example: "A12345678",
            },
            document_front: {
              type: "string",
              description: "Base64 encoded or URL to front image",
            },
            document_back: {
              type: "string",
              description: "Base64 encoded or URL to back image",
            },
            selfie: {
              type: "string",
              description: "Base64 encoded or URL to selfie",
            },
          },
        },

        // Token Schema
        Token: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            name: {
              type: "string",
              example: "Tether USD",
            },
            symbol: {
              type: "string",
              example: "USDT",
            },
            decimals: {
              type: "integer",
              example: 18,
            },
            contract_address: {
              type: "string",
              example: "0xdac17f958d2ee523a2206206994597c13d831ec7",
            },
            chain_id: {
              type: "integer",
              example: 1,
            },
            logo: {
              type: "string",
              description: "Token logo URL",
            },
            price: {
              type: "number",
              example: 1.0,
            },
            is_active: {
              type: "boolean",
              example: true,
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // Chain Schema
        Chain: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            name: {
              type: "string",
              example: "Ethereum",
            },
            chain_id: {
              type: "integer",
              example: 1,
            },
            rpc_url: {
              type: "string",
              example: "https://mainnet.infura.io/v3/...",
            },
            explorer_url: {
              type: "string",
              example: "https://etherscan.io",
            },
            is_active: {
              type: "boolean",
              example: true,
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // Notification Schema
        Notification: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1,
            },
            user_id: {
              type: "integer",
              example: 1,
            },
            title: {
              type: "string",
              example: "Fund received",
            },
            body: {
              type: "string",
              example: "You received 50 USDT from johndoe",
            },
            is_read: {
              type: "boolean",
              example: false,
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        // Rate Schemas
        CryptoRate: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              example: "BTC",
            },
            price: {
              type: "number",
              example: 45000.0,
            },
            change_24h: {
              type: "number",
              example: 2.5,
            },
          },
        },
        FiatRate: {
          type: "object",
          properties: {
            USD: {
              type: "number",
              example: 1,
            },
            NGN: {
              type: "number",
              example: 1600,
            },
          },
        },

        // Bill Payment Schemas
        BillService: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            service_type: {
              type: "string",
            },
          },
        },
        BillVariation: {
          type: "object",
          properties: {
            variation_code: {
              type: "string",
            },
            name: {
              type: "string",
            },
            variation_amount: {
              type: "string",
            },
            fixedPrice: {
              type: "string",
            },
          },
        },

        // File Upload
        FileUploadRequest: {
          type: "object",
          required: ["file"],
          properties: {
            file: {
              type: "string",
              format: "binary",
              description: "File to upload",
            },
          },
        },
        FileUploadResponse: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL of uploaded file",
              example: "https://res.cloudinary.com/...",
            },
          },
        },

        // Tag Operations
        RegisterTagRequest: {
          type: "object",
          required: ["tag", "chain"],
          properties: {
            tag: {
              type: "string",
              example: "johndoe",
            },
            chain: {
              type: "string",
              example: "starknet",
            },
          },
        },
        GetTagAddressRequest: {
          type: "object",
          required: ["tag", "chain"],
          properties: {
            tag: {
              type: "string",
              example: "johndoe",
            },
            chain: {
              type: "string",
              example: "starknet",
            },
          },
        },
        GetTagBalanceRequest: {
          type: "object",
          required: ["tag", "chain"],
          properties: {
            tag: {
              type: "string",
              example: "johndoe",
            },
            chain: {
              type: "string",
              example: "starknet",
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: "Access token is missing or invalid",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                error: "Unauthorized - No token provided",
              },
            },
          },
        },
        NotFoundError: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                error: "Resource not found",
              },
            },
          },
        },
        ValidationError: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationError",
              },
            },
          },
        },
        InternalServerError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                error: "Internal server error",
              },
            },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
