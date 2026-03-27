import dotenv from 'dotenv';
dotenv.config();

export const circuitBreakerConfig = {
    // Default configuration for all circuit breakers
    default: {
        timeout: 10000, // Action timeout (e.g. 10s)
        errorThresholdPercentage: 50,
        resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT) || 60000, // Try again after 60s
        rollingCountTimeout: 10000,
        rollingCountBuckets: 10,
        rollingCountThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD) || 5, // Open after 5 failures in window
        successThreshold: 2, // Close after 2 successes
    },
    
    // Service specific overrides
    services: {
        paystack: {
            name: 'Paystack Service',
        },
        monnify: {
            name: 'Monnify Service',
        },
        evm: {
            name: 'EVM RPC',
        },
        starknet: {
            name: 'Starknet RPC',
        },
        exchangeRate: {
            name: 'Exchange Rate API',
            fallback: (err) => {
                console.error('Exchange Rate API Circuit Breaker Fallback');
                return { success: false, message: 'Exchange Rate Service is currently unavailable', rate: 1.0 };
            }
        },
        cryptoApi: {
            name: 'Free Crypto API',
        }
    }
};
